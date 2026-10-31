'use strict';
(() => {
  const key='hexora-appearance-theme';
  const themes=new Set(['classic','obsidian']);
  const safe=value=>themes.has(value)?value:'classic';
  const apply=value=>{
    const theme=safe(value);
    document.documentElement.dataset.hexoraTheme=theme;
    try{localStorage.setItem(key,theme);}catch{}
    for(const button of document.querySelectorAll('[data-theme-choice]')){
      const selected=button.dataset.themeChoice===theme;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
    const status=document.getElementById('appearance-status');
    if(status)status.textContent='Active theme: '+(theme==='classic'?'Classic':'Obsidian');
  };
  let initial='classic';
  try{initial=safe(localStorage.getItem(key));}catch{}
  apply(initial);
  const open=()=>{
    document.getElementById('appearance-overlay')?.classList.remove('hidden');
    window.hexora?.action('modal',true);
  };
  const close=()=>{
    document.getElementById('appearance-overlay')?.classList.add('hidden');
    window.hexora?.action('modal',false);
  };
  document.getElementById('theme-rail')?.addEventListener('click',open);
  document.getElementById('appearance-close')?.addEventListener('click',close);
  document.getElementById('appearance-overlay')?.addEventListener('click',event=>{
    if(event.target.id==='appearance-overlay')close();
  });
  for(const button of document.querySelectorAll('[data-theme-choice]'))button.addEventListener('click',()=>apply(button.dataset.themeChoice));
  window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('appearance-overlay')?.classList.contains('hidden'))close();});
})();
