import{mkdtempSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{spawn}from'node:child_process';
const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'8790',HOST:'127.0.0.1',DATA_DIR:mkdtempSync(join(tmpdir(),'stayscreen-browser-'))},stdio:['ignore','pipe','inherit']});
await new Promise(ok=>child.stdout.once('data',ok));
let cookie='';const base='http://127.0.0.1:8790/api';async function api(path,body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const b=await r.json();if(!r.ok)throw new Error(JSON.stringify(b));return b}
await api('/setup',{email:'qa@example.test',password:'local-qa-password-only',name:'QA Operator',organization:'QA Hotel'});
const branch=await api('/branches',{name:'Test Bangkok',timezone:'Asia/Bangkok'});
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=','base64');
const r=await fetch(base+'/media?name=fixture.png&branch='+branch.id,{method:'POST',headers:{Cookie:cookie},body:image});const media=await r.json();
const p=await api('/playlists',{name:'QA Playlist',branch:branch.id,items:[{media:media.id,duration:3}]});await api(`/playlists/${p.id}/publish`,{});
console.log('QA fixture ready http://127.0.0.1:8790 (temporary database)');
process.on('SIGTERM',()=>child.kill());
