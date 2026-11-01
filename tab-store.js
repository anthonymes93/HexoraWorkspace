'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

class TabStore {
 constructor(dataDir) {
  fs.mkdirSync(dataDir,{recursive:true});
  this.file=path.join(dataDir,'hexora-tabs.sqlite');
  this.db=new DatabaseSync(this.file);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS tabs (
    id INTEGER PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL,
    workspace TEXT NOT NULL DEFAULT 'web', pinned INTEGER NOT NULL DEFAULT 0,
    muted INTEGER NOT NULL DEFAULT 0, last_active INTEGER NOT NULL DEFAULT 0,
    ordinal INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX IF NOT EXISTS idx_tabs_workspace_order ON tabs(workspace, ordinal DESC, id DESC);
   CREATE INDEX IF NOT EXISTS idx_tabs_workspace_active ON tabs(workspace, last_active DESC);
   CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  this.db.exec(`CREATE TABLE IF NOT EXISTS tab_stacks(id INTEGER PRIMARY KEY AUTOINCREMENT,workspace TEXT NOT NULL,name TEXT NOT NULL,parent_id INTEGER REFERENCES tab_stacks(id) ON DELETE SET NULL,collapsed INTEGER NOT NULL DEFAULT 0);
   CREATE INDEX IF NOT EXISTS idx_stacks_parent ON tab_stacks(workspace,parent_id);
   CREATE TABLE IF NOT EXISTS tab_stack_members(tab_id INTEGER PRIMARY KEY,stack_id INTEGER NOT NULL REFERENCES tab_stacks(id) ON DELETE CASCADE);
   CREATE INDEX IF NOT EXISTS idx_stack_members ON tab_stack_members(stack_id);`);
  if(!this.db.prepare('PRAGMA table_info(tab_stacks)').all().some(c=>c.name==='anchor_tab_id'))this.db.exec('ALTER TABLE tab_stacks ADD COLUMN anchor_tab_id INTEGER');
  if(!this.db.prepare('PRAGMA table_info(tab_stacks)').all().some(c=>c.name==='ordinal'))this.db.exec('ALTER TABLE tab_stacks ADD COLUMN ordinal INTEGER NOT NULL DEFAULT 0');
  this.db.exec('UPDATE tab_stacks SET ordinal=COALESCE((SELECT ordinal FROM tabs WHERE id=tab_stacks.anchor_tab_id),id) WHERE ordinal=0');
  this.db.exec('PRAGMA foreign_keys=ON');
  this.q={
   get:this.db.prepare('SELECT * FROM tabs WHERE id=?'),
   put:this.db.prepare(`INSERT INTO tabs(id,url,title,workspace,pinned,muted,last_active,ordinal)
      VALUES (@id,@url,@title,@workspace,@pinned,@muted,@last_active,@ordinal)
      ON CONFLICT(id) DO UPDATE SET url=excluded.url,title=excluded.title,workspace=excluded.workspace,pinned=excluded.pinned,muted=excluded.muted,last_active=excluded.last_active,ordinal=excluded.ordinal`),
   del:this.db.prepare('DELETE FROM tabs WHERE id=?'),
   page:this.db.prepare('SELECT * FROM tabs WHERE workspace=? ORDER BY ordinal DESC,id DESC LIMIT ? OFFSET ?'),
   counts:this.db.prepare('SELECT workspace, COUNT(*) AS count FROM tabs GROUP BY workspace'),
   count:this.db.prepare('SELECT COUNT(*) AS count FROM tabs'),
   max:this.db.prepare('SELECT COALESCE(MAX(id),0) AS max FROM tabs'),
   latest:this.db.prepare('SELECT id FROM tabs ORDER BY last_active DESC LIMIT 1'),
   metaGet:this.db.prepare('SELECT value FROM meta WHERE key=?'),
   metaSet:this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'),
   search:this.db.prepare("SELECT * FROM tabs WHERE (title LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\') ORDER BY last_active DESC LIMIT ?")
  };
 }
 total(){return this.q.count.get().count;}
 nextId(){return this.q.max.get().max+1;}
 get(id){return this.q.get.get(id)||null;}
 save(t){this.q.put.run({id:t.id,url:t.url,title:t.title,workspace:t.workspace,pinned:+!!t.pinned,muted:+!!t.muted,last_active:t.lastActive||Date.now(),ordinal:t.ordinal||t.id});}
 insertAfter(tab,anchorId){
  const anchor=this.get(anchorId);
  if(!anchor||anchor.workspace!==tab.workspace)throw Error('Active tab is unavailable');
  const members=this.db.prepare('SELECT stack_id FROM tab_stack_members WHERE tab_id=?').get(anchorId);
  const ids=members
   ?this.db.prepare('SELECT t.id FROM tabs t JOIN tab_stack_members m ON m.tab_id=t.id WHERE m.stack_id=? ORDER BY t.ordinal DESC,t.id DESC').all(members.stack_id).map(x=>x.id)
   :this.db.prepare('SELECT t.id FROM tabs t LEFT JOIN tab_stack_members m ON m.tab_id=t.id WHERE t.workspace=? AND m.tab_id IS NULL ORDER BY t.ordinal DESC,t.id DESC').all(tab.workspace).map(x=>x.id);
  const index=ids.indexOf(anchorId);
  if(index<0)throw Error('Active tab cannot be located');
  ids.splice(index+1,0,tab.id);
  this.db.exec('BEGIN');
  try{
   this.save(tab);
   if(members)this.db.prepare('INSERT INTO tab_stack_members(tab_id,stack_id) VALUES(?,?)').run(tab.id,members.stack_id);
   const max=this.db.prepare('SELECT COALESCE(MAX(ordinal),0) AS n FROM tabs').get().n;
   const update=this.db.prepare('UPDATE tabs SET ordinal=? WHERE id=?');
   ids.forEach((id,i)=>update.run(max+ids.length-i,id));
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 delete(id){this.db.prepare('DELETE FROM tab_stack_members WHERE tab_id=?').run(id);this.q.del.run(id);}
 reorderVisible(workspace,ids){
  if(typeof workspace!=='string'||!Array.isArray(ids)||ids.length<2||ids.length>16||!ids.every(Number.isSafeInteger)||new Set(ids).size!==ids.length)throw new Error('Invalid tab order');
  const rows=this.page(workspace,0,50);
  const visible=rows.slice(0,16).map(t=>t.id);
  if(ids.length!==visible.length||!ids.every(id=>visible.includes(id)))throw new Error('Tabs changed while dragging; try again');
  const byId=new Map(rows.map(row=>[row.id,row]));
  const ordered=[...ids.map(id=>byId.get(id)),...rows.slice(16)];
  const max=this.db.prepare('SELECT COALESCE(MAX(ordinal),0) AS n FROM tabs WHERE workspace=?').get(workspace).n;
  const update=this.db.prepare('UPDATE tabs SET ordinal=? WHERE id=? AND workspace=?');
  this.db.exec('BEGIN');
  try{
   for(let i=0;i<ordered.length;i++)update.run(max+ordered.length-i,ordered[i].id,workspace);
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }

 page(workspace,offset=0,limit=50){return this.q.page.all(workspace,Math.min(100,Math.max(1,limit)),Math.max(0,offset));}
 counts(){return this.q.counts.all();}
 search(term,limit=40){const value='%'+String(term).replace(/[\\%_]/g,m=>'\\'+m)+'%';return this.q.search.all(value,value,Math.min(100,Math.max(1,limit)));}
 reorderStack(stackId,ids){
  if(!Number.isSafeInteger(stackId)||!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||!ids.every(Number.isSafeInteger))throw Error('Invalid reorder');
  const existing=this.db.prepare('SELECT m.tab_id FROM tab_stack_members m JOIN tabs t ON t.id=m.tab_id WHERE m.stack_id=? ORDER BY t.ordinal DESC,t.id DESC').all(stackId).map(x=>x.tab_id);
  if(existing.length!==ids.length||!ids.every(id=>existing.includes(id)))throw Error('Stack changed while dragging');
  const max=this.db.prepare('SELECT COALESCE(MAX(ordinal),0) n FROM tabs').get().n;
  const update=this.db.prepare('UPDATE tabs SET ordinal=? WHERE id=?');
  this.db.exec('BEGIN');
  try{ids.forEach((id,i)=>update.run(max+ids.length-i,id));this.db.exec('COMMIT');}
  catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 stacks(workspace){
  return {stacks:this.db.prepare('SELECT * FROM tab_stacks WHERE workspace=? ORDER BY id').all(workspace),
   members:this.db.prepare('SELECT m.tab_id,m.stack_id FROM tab_stack_members m JOIN tabs t ON t.id=m.tab_id WHERE t.workspace=? ORDER BY t.ordinal DESC,t.id DESC').all(workspace)};
 }
 createStack(workspace,name,tabId=null,parentId=null){
  if(typeof workspace!=='string'||!workspace||typeof name!=='string'||!name.trim()||name.length>80)throw Error('Invalid stack name');
  if(parentId!==null&&this.db.prepare('SELECT workspace FROM tab_stacks WHERE id=?').get(parentId)?.workspace!==workspace)throw Error('Invalid parent stack');
  if(tabId!==null&&this.get(tabId)?.workspace!==workspace)throw Error('Tab is in another workspace');
  this.db.exec('BEGIN');
  try{
   const id=Number(this.db.prepare('INSERT INTO tab_stacks(workspace,name,parent_id) VALUES(?,?,?)').run(workspace,name.trim(),parentId).lastInsertRowid);
   if(tabId!==null)this.db.prepare('INSERT INTO tab_stack_members(tab_id,stack_id) VALUES(?,?) ON CONFLICT(tab_id) DO UPDATE SET stack_id=excluded.stack_id').run(tabId,id);
   this.db.exec('COMMIT');return id;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 createStackPair(workspace,name,sourceId,targetId,parentId){
  if(sourceId===targetId)throw Error('Choose two distinct tabs');
  if(this.get(sourceId)?.workspace!==workspace||this.get(targetId)?.workspace!==workspace)throw Error('Tabs must belong to the same workspace');
  this.db.exec('BEGIN');
  try{
   const row=parentId===null?null:this.db.prepare('SELECT workspace FROM tab_stacks WHERE id=?').get(parentId);
   if(parentId!==null&&row?.workspace!==workspace)throw Error('Invalid parent stack');
   const result=this.db.prepare('INSERT INTO tab_stacks(workspace,name,parent_id,anchor_tab_id,ordinal) VALUES(?,?,?,?,?)').run(workspace,name,parentId,targetId,this.get(targetId).ordinal);
   const id=Number(result.lastInsertRowid);
   const move=this.db.prepare('INSERT INTO tab_stack_members(tab_id,stack_id) VALUES(?,?) ON CONFLICT(tab_id) DO UPDATE SET stack_id=excluded.stack_id');
   move.run(targetId,id);move.run(sourceId,id);
   // Keep the drop target first and dragged tab last in the new child row.
   const first=this.get(targetId),second=this.get(sourceId);
   const base=Math.max(first.ordinal,second.ordinal);
   this.db.prepare('UPDATE tabs SET ordinal=? WHERE id=?').run(base+2,targetId);
   this.db.prepare('UPDATE tabs SET ordinal=? WHERE id=?').run(base+1,sourceId);
   this.db.exec('COMMIT');return id;
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 reorderRow(workspace,parentId,items){
  if(!Array.isArray(items)||!items.length||items.length>1000)throw Error('Invalid row order');
  const tabs=parentId===null
   ?this.db.prepare('SELECT t.id FROM tabs t LEFT JOIN tab_stack_members m ON m.tab_id=t.id WHERE t.workspace=? AND m.tab_id IS NULL').all(workspace).map(x=>'t:'+x.id)
   :this.db.prepare('SELECT m.tab_id id FROM tab_stack_members m JOIN tabs t ON t.id=m.tab_id WHERE t.workspace=? AND m.stack_id=?').all(workspace,parentId).map(x=>'t:'+x.id);
  const stacks=parentId===null
   ?this.db.prepare('SELECT id FROM tab_stacks WHERE workspace=? AND parent_id IS NULL').all(workspace).map(x=>'s:'+x.id)
   :this.db.prepare('SELECT id FROM tab_stacks WHERE workspace=? AND parent_id=?').all(workspace,parentId).map(x=>'s:'+x.id);
  const valid=[...tabs,...stacks];
  if(items.length!==valid.length||new Set(items).size!==valid.length||!items.every(x=>valid.includes(x)))throw Error('Row changed during drag');
  const max=Math.max(this.db.prepare('SELECT COALESCE(MAX(ordinal),0) n FROM tabs').get().n,this.db.prepare('SELECT COALESCE(MAX(ordinal),0) n FROM tab_stacks').get().n);
  this.db.exec('BEGIN');
  try{
   for(let i=0;i<items.length;i++){
    const [kind,id]=items[i].split(':');
    if(kind==='t')this.db.prepare('UPDATE tabs SET ordinal=? WHERE id=?').run(max+items.length-i,id);
    else this.db.prepare('UPDATE tab_stacks SET ordinal=? WHERE id=?').run(max+items.length-i,id);
   }
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 putTabInStack(tabId,stackId){
  const tab=this.get(tabId);if(!tab)throw Error('Tab not found');
  if(stackId===null){this.db.prepare('DELETE FROM tab_stack_members WHERE tab_id=?').run(tabId);return;}
  const stack=this.db.prepare('SELECT workspace FROM tab_stacks WHERE id=?').get(stackId);
  if(!stack||stack.workspace!==tab.workspace)throw Error('Stack must be in the same workspace');
  this.db.exec('BEGIN');
  try{
   const min=this.db.prepare('SELECT MIN(t.ordinal) n FROM tabs t JOIN tab_stack_members m ON m.tab_id=t.id WHERE m.stack_id=?').get(stackId).n;
   this.db.prepare('INSERT INTO tab_stack_members(tab_id,stack_id) VALUES(?,?) ON CONFLICT(tab_id) DO UPDATE SET stack_id=excluded.stack_id').run(tabId,stackId);
   // Appending is intentional: dropped tabs are regular tabs at the far right.
   if(min!==null)this.db.prepare('UPDATE tabs SET ordinal=? WHERE id=?').run(min-1,tabId);
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 moveStack(id,parentId){
  const stack=this.db.prepare('SELECT * FROM tab_stacks WHERE id=?').get(id);
  if(!stack)throw Error('Stack not found');
  if(parentId===null){this.db.prepare('UPDATE tab_stacks SET parent_id=NULL WHERE id=?').run(id);return;}
  if(id===parentId)throw Error('Cannot nest a stack inside itself');
  const parent=this.db.prepare('SELECT * FROM tab_stacks WHERE id=?').get(parentId);
  if(!parent||parent.workspace!==stack.workspace)throw Error('Invalid destination');
  const ancestors=new Set([id]);let node=parent;
  while(node){if(ancestors.has(node.id))throw Error('A stack cannot contain itself');ancestors.add(node.id);node=node.parent_id===null?null:this.db.prepare('SELECT * FROM tab_stacks WHERE id=?').get(node.parent_id);}
  this.db.prepare('UPDATE tab_stacks SET parent_id=? WHERE id=?').run(parentId,id);
 }
 stackAction(id,action,value){
  const row=this.db.prepare('SELECT id FROM tab_stacks WHERE id=?').get(id);if(!row)throw Error('Stack not found');
  if(action==='rename'){if(typeof value!=='string'||!value.trim()||value.length>80)throw Error('Invalid name');this.db.prepare('UPDATE tab_stacks SET name=? WHERE id=?').run(value.trim(),id);}
  else if(action==='toggle')this.db.prepare('UPDATE tab_stacks SET collapsed=1-collapsed WHERE id=?').run(id);
  else if(action==='delete'){this.db.prepare('UPDATE tab_stacks SET parent_id=(SELECT parent_id FROM tab_stacks WHERE id=?) WHERE parent_id=?').run(id,id);this.db.prepare('DELETE FROM tab_stacks WHERE id=?').run(id);}
  else throw Error('Invalid stack operation');
 }
 lastActiveId(){return this.q.latest.get()?.id||null;}
 moveWorkspace(source,destination){this.db.prepare('UPDATE tabs SET workspace=? WHERE workspace=?').run(destination,source);}
 getMeta(key){return this.q.metaGet.get(key)?.value||null;}
 setMeta(key,value){this.q.metaSet.run(key,String(value));}
 importLegacy(jsonFile) {
  if(this.total())return 0;
  let legacy;try{legacy=JSON.parse(fs.readFileSync(jsonFile,'utf8'));}catch{return 0;}
  if(!Array.isArray(legacy.tabs))return 0;
  this.db.exec('BEGIN');
  try{
   let n=0;
   for(const t of legacy.tabs){
    if(!Number.isSafeInteger(t.id)||!t.url)continue;
    this.save({id:t.id,url:t.url,title:t.title||'ChatGPT',workspace:t.workspace||'web',pinned:t.pinned,muted:t.muted,lastActive:t.lastActive||Date.now(),ordinal:++n});
   }
   if(legacy.activeId)this.setMeta('activeId',legacy.activeId);
   this.db.exec('COMMIT');
   return n;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 close(){this.db.close();}
}
module.exports={TabStore};
