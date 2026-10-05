import { Store } from './store.js';

// Separate tables preserve the old ticket history during the switch to modmail.
export class MailStore extends Store {
  constructor(path) {
    super(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS mail_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guild TEXT NOT NULL, owner TEXT NOT NULL,
      channel TEXT UNIQUE, status TEXT NOT NULL, created INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS mail_active ON mail_threads(guild,owner) WHERE status IN ('open','creating');
    CREATE TABLE IF NOT EXISTS mail_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, thread INTEGER NOT NULL, source TEXT UNIQUE,
      kind TEXT NOT NULL, actor TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mail_blocks (guild TEXT NOT NULL, owner TEXT NOT NULL, PRIMARY KEY(guild,owner));`);
  }
  mail(id) { return this.unpack(this.db.prepare('SELECT * FROM mail_threads WHERE id=?').get(id)); }
  byChannel(channel) { return this.unpack(this.db.prepare('SELECT * FROM mail_threads WHERE channel=?').get(channel)); }
  active(guild,owner) { return this.unpack(this.db.prepare("SELECT * FROM mail_threads WHERE guild=? AND owner=? AND status IN ('open','creating')").get(guild,owner)); }
  createMail(guild,owner) {
    const r=this.db.prepare("INSERT INTO mail_threads(guild,owner,status,created,data) VALUES (?,?,'creating',?,?)").run(guild,owner,Date.now(),JSON.stringify({claimedBy:null,adminOnly:false}));
    return this.mail(Number(r.lastInsertRowid));
  }
  saveMail(t) { this.db.prepare('UPDATE mail_threads SET channel=?,status=?,data=? WHERE id=?').run(t.channel,t.status,JSON.stringify(t),t.id); }
  mails(guild) { return this.db.prepare("SELECT * FROM mail_threads WHERE guild=? AND status IN ('open','creating')").all(guild).map(r=>this.unpack(r)); }
  event(t,source,kind,actor,body,status='saved') {
    return Number(this.db.prepare('INSERT INTO mail_events(thread,source,kind,actor,body,status,created) VALUES (?,?,?,?,?,?,?)').run(t.id,source,kind,actor,body,status,Date.now()).lastInsertRowid);
  }
  source(source) { return this.db.prepare('SELECT * FROM mail_events WHERE source=?').get(source); }
  delivered(id,status) { this.db.prepare('UPDATE mail_events SET status=? WHERE id=?').run(status,id); }
  events(t) { return this.db.prepare('SELECT * FROM mail_events WHERE thread=? ORDER BY id').all(t.id); }
  block(guild,owner,value) { if(value) this.db.prepare('INSERT OR IGNORE INTO mail_blocks VALUES (?,?)').run(guild,owner); else this.db.prepare('DELETE FROM mail_blocks WHERE guild=? AND owner=?').run(guild,owner); }
  blocked(guild,owner) { return Boolean(this.db.prepare('SELECT 1 FROM mail_blocks WHERE guild=? AND owner=?').get(guild,owner)); }
}
