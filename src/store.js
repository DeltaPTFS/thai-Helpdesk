import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS config (guild TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT, guild TEXT NOT NULL, owner TEXT NOT NULL,
        channel TEXT UNIQUE, status TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS tickets_owner ON tickets(guild,owner,status);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, ticket INTEGER, actor TEXT, action TEXT, created INTEGER);
    `);
  }
  config(guild) { const r = this.db.prepare('SELECT data FROM config WHERE guild=?').get(guild); return r ? JSON.parse(r.data) : null; }
  saveConfig(guild, data) { this.db.prepare('INSERT INTO config VALUES (?,?) ON CONFLICT(guild) DO UPDATE SET data=excluded.data').run(guild, JSON.stringify(data)); }
  unpack(r) { return r ? { ...JSON.parse(r.data), id:r.id, guild:r.guild, owner:r.owner, channel:r.channel, status:r.status, created:r.created } : null; }
  ticket(channel) { return this.unpack(this.db.prepare('SELECT * FROM tickets WHERE channel=?').get(channel)); }
  get(id) { return this.unpack(this.db.prepare('SELECT * FROM tickets WHERE id=?').get(id)); }
  owned(guild, owner) { return this.db.prepare("SELECT * FROM tickets WHERE guild=? AND owner=? AND status IN ('open','creating')").all(guild,owner).map(r=>this.unpack(r)); }
  latest(guild, owner) { return this.unpack(this.db.prepare('SELECT * FROM tickets WHERE guild=? AND owner=? ORDER BY created DESC LIMIT 1').get(guild,owner)); }
  create(guild, owner, data) {
    const r = this.db.prepare("INSERT INTO tickets(guild,owner,status,created,data) VALUES (?,?,'creating',?,?)").run(guild,owner,Date.now(),JSON.stringify(data));
    return this.get(Number(r.lastInsertRowid));
  }
  save(t) { this.db.prepare('UPDATE tickets SET channel=?,status=?,data=? WHERE id=?').run(t.channel,t.status,JSON.stringify(t),t.id); return t; }
  audit(t, actor, action) { this.db.prepare('INSERT INTO audit(ticket,actor,action,created) VALUES (?,?,?,?)').run(t.id,actor,action,Date.now()); }
  stats(guild) { return this.db.prepare('SELECT status,COUNT(*) AS count FROM tickets WHERE guild=? GROUP BY status').all(guild); }
  history(t) { return this.db.prepare('SELECT * FROM audit WHERE ticket=? ORDER BY id').all(t.id); }
  all(guild) { return this.db.prepare("SELECT * FROM tickets WHERE guild=? AND status IN ('open','closed','creating')").all(guild).map(r=>this.unpack(r)); }
  close() { this.db.close(); }
}

// Serialize mutations within each guild. Rejections never poison the queue.
export class Locks {
  queue = new Map();
  async run(key, fn) {
    const previous = this.queue.get(key) ?? Promise.resolve();
    const current = previous.catch(()=>{}).then(fn);
    this.queue.set(key,current);
    try { return await current; } finally { if(this.queue.get(key)===current) this.queue.delete(key); }
  }
}
