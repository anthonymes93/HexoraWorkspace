'use strict';
(() => {
  const key='hexora-appearance-theme';
  const themes=new Set(['classic','obsidian','white','omega']);
  const safe=value=>themes.has(value)?value:'classic';
  const syncScrollbar=()=>window.hexora?.action('scrollbar-theme',{theme:document.documentElement.dataset.hexoraTheme,color:document.documentElement.dataset.hexoraOmegaColor}).catch(()=>{});
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
    if(status)status.textContent='Active theme: '+({classic:'Classic',obsidian:'Obsidian',white:'White',omega:'Omega'}[theme]);
    const omegaSection=document.getElementById('omega-color-section');
    if(omegaSection)omegaSection.hidden=theme!=='omega';
    syncScrollbar();
  };
  const omegaKey='hexora-omega-color';
  const omegaColors=[["blue","Blue"],["red","Red"],["orange","Orange"],["amber","Amber"],["green","Green"],["teal","Teal"],["cyan","Cyan"],["purple","Purple"],["pink","Pink"],["indigo","Indigo"]];
  const omegaSafe=value=>omegaColors.some(([id])=>id===value)?value:'blue';
  const applyOmega=value=>{
    const color=omegaSafe(value);
    document.documentElement.dataset.hexoraOmegaColor=color;
    syncScrollbar();
    try{localStorage.setItem(omegaKey,color);}catch{}
    document.querySelectorAll('[data-omega-choice]').forEach(button=>{
      const selected=button.dataset.omegaChoice===color;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
  };
  // Important reminders gradually blend Omega's frame colors over the final 120 seconds.
  const transitionKey='hexora-important-omega-transition';
  const palette={red:['#b10501','#ce3029'],blue:['#1c347f','#405a9b']};
  let animationFrame=0,lastScrollbarUpdate=0;
  const blend=(from,to,progress)=>{
    const a=parseInt(from.slice(1),16),b=parseInt(to.slice(1),16);
    const channel=shift=>Math.round(((a>>shift)&255)*(1-progress)+((b>>shift)&255)*progress);
    return '#'+[channel(16),channel(8),channel(0)].map(n=>n.toString(16).padStart(2,'0')).join('');
  };
  const clearTransition=()=>{
    cancelAnimationFrame(animationFrame);animationFrame=0;
    document.documentElement.style.removeProperty('--hexora-frame-blue');
    document.documentElement.style.removeProperty('--hexora-frame-blue-light');
    try{localStorage.removeItem(transitionKey);}catch{}
  };
  const runTransition=record=>{
    cancelAnimationFrame(animationFrame);
    const tick=()=>{
      if(document.documentElement.dataset.hexoraTheme!=='omega'){clearTransition();return;}
      const progress=Math.max(0,Math.min(1,(Date.now()-(record.due-120000))/120000));
      if(progress>=1){clearTransition();applyOmega(record.to);return;}
      const root=document.documentElement;
      root.style.setProperty('--hexora-frame-blue',blend(palette[record.from][0],palette[record.to][0],progress));
      root.style.setProperty('--hexora-frame-blue-light',blend(palette[record.from][1],palette[record.to][1],progress));
      if(Date.now()-lastScrollbarUpdate>1000){lastScrollbarUpdate=Date.now();syncScrollbar();}
      animationFrame=requestAnimationFrame(tick);
    };
    tick();
  };
  window.addEventListener('hexora:important-reminder',event=>{
    if(document.documentElement.dataset.hexoraTheme!=='omega')return;
    const from=document.documentElement.dataset.hexoraOmegaColor;
    if(from!=='red'&&from!=='blue')return;
    const due=Number(event.detail?.due);
    if(!Number.isFinite(due))return;
    const record={from,to:from==='red'?'blue':'red',due};
    try{localStorage.setItem(transitionKey,JSON.stringify(record));}catch{}
    runTransition(record);
  });
  try{
    const pending=JSON.parse(localStorage.getItem(transitionKey)||'null');
    if(pending&&palette[pending.from]&&palette[pending.to]&&Number.isFinite(pending.due)){
      if(Date.now()>=pending.due){clearTransition();applyOmega(pending.to);}
      else if(Date.now()>=pending.due-120000)runTransition(pending);
    }
  }catch{}

  const omegaHost=document.getElementById('omega-color-options');
  if(omegaHost)for(const [id,name] of omegaColors){
    const button=document.createElement('button');button.type='button';button.className='omega-color-choice';
    button.dataset.omegaChoice=id;button.setAttribute('aria-label',name);button.title=name;
    const swatch=document.createElement('span');swatch.className='omega-color-swatch omega-color-swatch-'+id;
    const label=document.createElement('span');label.textContent=name;
    button.append(swatch,label);button.addEventListener('click',()=>{clearTransition();applyOmega(id);});omegaHost.append(button);
  }
  let savedOmega='blue';try{savedOmega=omegaSafe(localStorage.getItem(omegaKey));}catch{}
  applyOmega(savedOmega);
  const updateOmegaVisibility=()=>{const section=document.getElementById('omega-color-section');if(section)section.hidden=document.documentElement.dataset.hexoraTheme!=='omega';};
  updateOmegaVisibility();

  const accents=[
    ['purple','Purple','#ad95ff','#ad95ff'],
    ['teal','Teal','#34c7b1','#34c7b1'],
    ['dark-gray','Dark Gray','#777d88','#a2a8b4'],
    ['blue','Ocean Blue','#64a9f7','#64a9f7'],
    ['green','Emerald','#61c897','#61c897'],
    ['orange','Amber','#ecab63','#ecab63'],
    ['rose','Rose','#ec8fb1','#ec8fb1'],
    ['ice','Ice Blue','#8bcbdc','#8bcbdc']
  ];
  const accentNames=new Map(accents.map(([id,name])=>[id,name]));
  const safeAccent=value=>accentNames.has(value)?value:'purple';
  const applyAccent=value=>{
    const accent=safeAccent(value);
    document.documentElement.dataset.hexoraAccent=accent;
    try{localStorage.setItem(accentKey,accent);}catch{}
    document.querySelectorAll('[data-accent-choice]').forEach(button=>{
      const active=button.dataset.accentChoice===accent;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    });
  };
  const accentHost=document.getElementById('accent-options');
  if(accentHost)for(const [id,name,swatch] of accents){
    const button=document.createElement('button');button.type='button';button.className='accent-choice';
    button.dataset.accentChoice=id;button.title=name;button.setAttribute('aria-label',name);
    const circle=document.createElement('span');circle.className='accent-swatch';circle.style.background=swatch;
    const label=document.createElement('span');label.textContent=name;
    button.append(circle,label);button.addEventListener('click',()=>applyAccent(id));accentHost.append(button);
  }
  let savedAccent='purple';try{savedAccent=safeAccent(localStorage.getItem(accentKey));}catch{}
  applyAccent(savedAccent);
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
  window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue);if(event.key===accentKey)applyAccent(event.newValue);if(event.key===omegaKey)applyOmega(event.newValue);if(event.key===key)updateOmegaVisibility();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('appearance-overlay')?.classList.contains('hidden'))close();});
})();
