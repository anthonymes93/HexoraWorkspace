const tabs = document.querySelector('#tabs');
window.hexora.onState(list => {
  tabs.replaceChildren();
  for (const item of list) {
    const el = document.createElement('button');
    el.className = `tab${item.active ? ' active' : ''}`;
    el.title = item.url || 'Loading ChatGPT';
    const title = document.createElement('span');
    title.className = 'name';
    title.textContent = (item.loading ? '◌  ' : '') + (item.title || 'ChatGPT');
    const close = document.createElement('span');
    close.className = 'close'; close.textContent = '×'; close.title = 'Close tab';
    close.addEventListener('click', e => { e.stopPropagation(); window.hexora.action('close', item.id); });
    el.addEventListener('click', () => window.hexora.action('activate', item.id));
    el.append(title, close);
    tabs.append(el);
  }
});
for(const action of ['new','back','forward','reload','external']) {
  document.querySelector('#'+action).addEventListener('click',()=>window.hexora.action(action==='external'?'open-external':action));
}
