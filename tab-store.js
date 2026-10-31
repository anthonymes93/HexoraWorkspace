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
 delete(id){this.q.del.run(id);}
 page(workspace,offset=0,limit=50){return this.q.page.all(workspace,Math.min(100,Math.max(1,limit)),Math.max(0,offset));}
 counts(){return this.q.counts.all();}
 search(term,limit=40){const value='%'+String(term).replace(/[\\%_]/g,m=>'\\'+m)+'%';return this.q.search.all(value,value,Math.min(100,Math.max(1,limit)));}
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
