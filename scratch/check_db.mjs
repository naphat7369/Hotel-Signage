import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/signage.sqlite");

const playlists = db.prepare("SELECT * FROM entities WHERE kind='playlists'").all();
console.log('PLAYLISTS:', JSON.stringify(playlists.map(p => ({ id: p.id, ...JSON.parse(p.data) })), null, 2));

const media = db.prepare("SELECT * FROM entities WHERE kind='media'").all();
console.log('MEDIA:', JSON.stringify(media.map(m => ({ id: m.id, ...JSON.parse(m.data) })), null, 2));

const versions = db.prepare("SELECT * FROM entities WHERE kind='versions'").all();
console.log('VERSIONS:', JSON.stringify(versions.map(v => ({ id: v.id, ...JSON.parse(v.data) })), null, 2));
