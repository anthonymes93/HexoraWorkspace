$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=Split-Path -Parent $PSScriptRoot
$source=Get-Content (Join-Path $root 'hexora-logo.js') -Raw
$match=[regex]::Match($source,"const PNG_BASE64='([^']+)'")
if (!$match.Success) { throw 'Hexora logo missing' }
$bytes=[Convert]::FromBase64String($match.Groups[1].Value)
$ms=[IO.MemoryStream]::new($bytes)
$original=[Drawing.Bitmap]::new($ms)
try {
  $left=$original.Width; $top=$original.Height; $right=-1; $bottom=-1
  for($y=0;$y -lt $original.Height;$y++){for($x=0;$x -lt $original.Width;$x++){
    if($original.GetPixel($x,$y).A -gt 8){$left=[Math]::Min($left,$x);$top=[Math]::Min($top,$y);$right=[Math]::Max($right,$x);$bottom=[Math]::Max($bottom,$y)}
  }}
  if($right -lt 0){throw 'Transparent logo'}
  $sizes=@(16,24,32,48,64,128,256)
  $pngs=@()
  foreach($size in $sizes){
    $bitmap=[Drawing.Bitmap]::new($size,$size)
    try {
      $g=[Drawing.Graphics]::FromImage($bitmap)
      try {
        $g.Clear([Drawing.Color]::Transparent)
        $g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $width=$right-$left+1;$height=$bottom-$top+1
        $scale=($size*0.94)/[Math]::Max($width,$height)
        $w=[int][Math]::Round($width*$scale);$h=[int][Math]::Round($height*$scale)
        $dest=[Drawing.Rectangle]::new([int](($size-$w)/2),[int](($size-$h)/2),$w,$h)
        $src=[Drawing.Rectangle]::new($left,$top,$width,$height)
        $g.DrawImage($original,$dest,$src,[Drawing.GraphicsUnit]::Pixel)
      } finally {$g.Dispose()}
      $buffer=[IO.MemoryStream]::new()
      try {$bitmap.Save($buffer,[Drawing.Imaging.ImageFormat]::Png);$pngs+=,$buffer.ToArray()}
      finally {$buffer.Dispose()}
    } finally {$bitmap.Dispose()}
  }
  $target=Join-Path $root 'build/hexora.ico'
  [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
  $out=[IO.File]::Create($target)
  try {
    $writer=[IO.BinaryWriter]::new($out)
    $writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$sizes.Count)
    $offset=6+16*$sizes.Count
    for($i=0;$i -lt $sizes.Count;$i++){
      $n=$sizes[$i];$png=$pngs[$i]
      $writer.Write([byte]($n % 256));$writer.Write([byte]($n % 256))
      $writer.Write([byte]0);$writer.Write([byte]0)
      $writer.Write([uint16]1);$writer.Write([uint16]32)
      $writer.Write([uint32]$png.Length);$writer.Write([uint32]$offset)
      $offset+=$png.Length
    }
    foreach($png in $pngs){$writer.Write($png)}
    $writer.Flush()
  } finally {$out.Dispose()}
  Write-Host "Stable icon generated: $target"
} finally {$original.Dispose();$ms.Dispose()}
