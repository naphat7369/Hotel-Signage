import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { resolve,join } from 'node:path';
const source=resolve(process.env.DATA_DIR||'data');
const target=resolve(process.env.BACKUP_DIR||'backups',new Date().toISOString().replaceAll(':','-'));
mkdirSync(target,{recursive:true});
const db=new DatabaseSync(join(source,'signage.sqlite'),{readOnly:true});
await backup(db,join(target,'signage.sqlite'));
const files=db.prepare("SELECT id,kind FROM entities WHERE kind IN ('media','displays')").all();
for(const folder of ['media','screens'])mkdirSync(join(target,folder));
for(const f of files){const folder=f.kind==='media'?'media':'screens';try{cpSync(join(source,folder,f.id),join(target,folder,f.id))}catch(e){if(f.kind==='media')throw e}}
writeFileSync(join(target,'backup.json'),JSON.stringify({created:new Date().toISOString(),source,media:files.filter(f=>f.kind==='media').length},null,2));
db.close();console.log('Backup completed: '+target);
