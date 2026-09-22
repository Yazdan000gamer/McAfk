'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const CFG = require('./config');
fs.mkdirSync(path.dirname(CFG.DB_PATH), { recursive: true });
const db = new Database(CFG.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS bots (id TEXT PRIMARY KEY,name TEXT NOT NULL,host TEXT NOT NULL,port INTEGER NOT NULL,version TEXT NOT NULL,chat_id TEXT,user_id TEXT,owner_username TEXT,auto_reconnect INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id);
CREATE TABLE IF NOT EXISTS forwards (user_key TEXT NOT NULL,chat_id TEXT NOT NULL,PRIMARY KEY(user_key,chat_id));
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT);
`);
const stmt = {
 upsertBot: db.prepare(`INSERT INTO bots (id,name,host,port,version,chat_id,user_id,owner_username,auto_reconnect,created_at) VALUES (@id,@name,@host,@port,@version,@chatId,@userId,@ownerUsername,@autoReconnect,@createdAt) ON CONFLICT(id) DO UPDATE SET name=excluded.name,host=excluded.host,port=excluded.port,version=excluded.version,chat_id=excluded.chat_id,user_id=excluded.user_id,owner_username=excluded.owner_username,auto_reconnect=excluded.auto_reconnect`),
 deleteBot: db.prepare('DELETE FROM bots WHERE id = ?'), allBots: db.prepare('SELECT * FROM bots'), countGlobal: db.prepare('SELECT COUNT(*) n FROM bots'), countUser: db.prepare('SELECT COUNT(*) n FROM bots WHERE user_id = ?'), addForward: db.prepare('INSERT OR IGNORE INTO forwards VALUES (?,?)'), removeForward: db.prepare('DELETE FROM forwards WHERE user_key=? AND chat_id=?'), deleteForwards: db.prepare('DELETE FROM forwards WHERE user_key=?'), forwards: db.prepare('SELECT * FROM forwards'), countForwards: db.prepare('SELECT COUNT(*) n FROM forwards WHERE user_key=?'), getMeta: db.prepare('SELECT value FROM meta WHERE key=?'), setMeta: db.prepare('INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
};
const saveBot = info => stmt.upsertBot.run({ id:String(info.id),name:info.name,host:info.host,port:info.port,version:info.version,chatId:info.chatId == null ? null : String(info.chatId),userId:info.userId == null ? null : String(info.userId),ownerUsername:info.ownerUsername || null,autoReconnect:info.autoReconnect === false ? 0 : 1,createdAt:info.createdAt || new Date().toISOString() });
const loadAllForwards = () => { const map=new Map(); for (const r of stmt.forwards.all()) { if(!map.has(r.user_key)) map.set(r.user_key,new Set()); map.get(r.user_key).add(r.chat_id); } return map; };
module.exports={db,saveBot,removeBot:id=>stmt.deleteBot.run(String(id)),loadAllBots:()=>stmt.allBots.all(),botCountGlobal:()=>stmt.countGlobal.get().n,botCountForUser:id=>stmt.countUser.get(String(id)).n,addForward:(k,c)=>stmt.addForward.run(String(k),String(c)),removeForward:(k,c)=>stmt.removeForward.run(String(k),String(c)),deleteForwardsForKey:k=>stmt.deleteForwards.run(String(k)),forwardCountForKey:k=>stmt.countForwards.get(String(k)).n,loadAllForwards,renameForwardKey:(a,b)=>{const rows=stmt.forwards.all().filter(r=>r.user_key===a);db.transaction(()=>{for(const r of rows)stmt.addForward.run(b,r.chat_id);stmt.deleteForwards.run(a)})();},getMeta:k=>stmt.getMeta.get(k)?.value||null,setMeta:(k,v)=>stmt.setMeta.run(k,String(v))};
