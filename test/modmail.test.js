import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection,ChannelType,PermissionFlagsBits as P } from 'discord.js';
import { MailStore } from '../src/mail-store.js';
import { Modmail } from '../src/modmail.js';
import { commands } from '../src/commands.js';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const member=(roles=[])=>({permissions:{has:()=>false},roles:{cache:new Map(roles.map(r=>[r,true]))}});
function fixture() {
  const store=new MailStore(':memory:'),sent=[],dm=[],responses=[];
  const c={supportRole:'support',adminRole:'admin',mailCategory:'category',mailLogs:'logs'};store.saveConfig('guild',c);
  const channel={id:'channel',type:ChannelType.GuildText,send:async p=>{sent.push(p);return {id:'posted'};},permissionOverwrites:{set:async p=>{channel.overwrites=p;}},messages:{fetch:async()=>new Collection()}};
  const guild={id:'guild',members:{fetch:async()=>({id:'owner'})},channels:{fetch:async id=>id==='logs'?{isTextBased:()=>true,send:async p=>sent.push(p)}:channel,create:async p=>{channel.overwrites=p.permissionOverwrites;return channel;},cache:new Collection([['channel',channel]])}};
  const client={user:{id:'bot'},guilds:{cache:new Collection([['guild',guild]])},users:{fetch:async()=>({send:async p=>dm.push(p)})}};
  const service=new Modmail(client,store,'guild');
  const incoming={id:'100000000000000001',author:{id:'owner',bot:false},channel:{type:ChannelType.DM},content:'Please help',attachments:new Collection(),reply:async p=>responses.push(p)};
  const i={id:'200000000000000001',user:{id:'staff'},member:member(['support']),guildId:'guild',channelId:'channel',guild,channel,options:{getSubcommand:()=> 'reply',getString:n=>n==='message'?'We can help':'Resolved',getAttachment:()=>null},editReply:async p=>responses.push(p)};
  const create=()=>{const t=store.createMail('guild','owner');t.channel='channel';t.status='open';store.saveMail(t);return t;};
  return {store,c,sent,dm,responses,channel,guild,client,service,incoming,i,create};
}
test('only modmail commands registered, with explicit replies',()=>{
  assert.deepEqual(commands.map(c=>c.name),['setup','panel','helpdesk','modmail']);
  assert.ok(commands.find(c=>c.name==='modmail').options.some(o=>o.name==='reply'));
});
test('member DM creates private staff conversation and forwards attachment links',async()=>{
  const f=fixture();f.incoming.attachments.set('a',{url:'https://cdn.discordapp.com/evidence.png'});
  await f.service.onMessage(f.incoming);
  const t=f.store.active('guild','owner');assert.equal(t.status,'open');
  assert.ok(f.channel.overwrites.find(o=>o.id==='guild').deny.includes(P.ViewChannel));
  assert.equal(f.channel.overwrites.some(o=>o.id==='owner'),false);
  assert.ok(f.sent.some(p=>p.content?.includes('evidence.png')));assert.equal(f.store.source(f.incoming.id).status,'delivered');f.store.close();
});
test('internal staff messages and bot messages never relay',async()=>{
  const f=fixture();await f.service.onMessage({...f.incoming,guildId:'guild'});await f.service.onMessage({...f.incoming,author:{id:'bot',bot:true}});
  assert.equal(f.sent.length,0);assert.equal(f.dm.length,0);f.store.close();
});
test('duplicate gateway messages do not relay twice',async()=>{
  const f=fixture();await Promise.all([f.service.onMessage(f.incoming),f.service.onMessage(f.incoming)]);
  assert.equal(f.sent.filter(p=>p.content?.includes('Please help')).length,1);f.store.close();
});
test('nonmembers and blocked users do not reach staff',async()=>{
  const f=fixture();f.store.block('guild','owner',true);await f.service.onMessage(f.incoming);assert.equal(f.sent.length,0);
  f.store.block('guild','owner',false);f.guild.members.fetch=async()=>{throw {code:10007};};await f.service.onMessage(f.incoming);assert.equal(f.sent.length,0);f.store.close();
});
test('staff reply delivers through the bot and records successful delivery',async()=>{
  const f=fixture();f.create();await f.service.action(f.i,f.c);assert.equal(f.dm.length,1);assert.ok(f.dm[0].content.includes('We can help'));
  assert.deepEqual(f.dm[0].allowedMentions,{parse:[]});assert.equal(f.store.source(f.i.id).status,'delivered');f.store.close();
});
test('DM-disabled failure never reports reply delivered',async()=>{
  const f=fixture();f.create();f.client.users.fetch=async()=>({send:async()=>{throw {code:50007};}});
  await assert.rejects(f.service.action(f.i,f.c),/not delivered/);assert.equal(f.store.source(f.i.id).status,'failed');assert.equal(f.sent.length,0);f.store.close();
});
test('nonstaff cannot reply and support cannot reply after escalation',async()=>{
  const f=fixture();const t=f.create();f.i.member=member();await assert.rejects(f.service.action(f.i,f.c),/permission/);
  f.i.member=member(['support']);t.adminOnly=true;f.store.saveMail(t);await assert.rejects(f.service.action(f.i,f.c),/permission/);assert.equal(f.dm.length,0);f.store.close();
});
test('internal note never generates a DM',async()=>{
  const f=fixture();f.create();f.i.options.getSubcommand=()=> 'note';await f.service.action(f.i,f.c);assert.equal(f.dm.length,0);assert.equal(f.store.source(f.i.id).kind,'internal note');f.store.close();
});
test('close is blocked if archive delivery fails',async()=>{
  const f=fixture();f.create();f.i.options.getSubcommand=()=> 'close';f.service.log=async()=>{throw Error('Archive failed');};
  await assert.rejects(f.service.action(f.i,f.c),/Archive failed/);assert.equal(f.store.byChannel('channel').status,'open');assert.equal(f.dm.length,0);f.store.close();
});
test('close retains channel and next DM starts a new conversation',async()=>{
  const f=fixture();const t=f.create();f.i.options.getSubcommand=()=> 'close';await f.service.action(f.i,f.c);assert.equal(f.store.mail(t.id).status,'closed');
  f.guild.channels.create=async p=>({...f.channel,id:'new-channel'});
  await f.service.onMessage(f.incoming);assert.notEqual(f.store.active('guild','owner').id,t.id);f.store.close();
});
test('escalation denies support while retaining admin access',async()=>{
  const f=fixture();f.create();f.i.options.getSubcommand=()=> 'escalate';await f.service.action(f.i,f.c);
  assert.ok(f.channel.overwrites.find(o=>o.id==='support').deny.includes(P.ViewChannel));assert.ok(f.channel.overwrites.find(o=>o.id==='admin').allow.includes(P.ViewChannel));f.store.close();
});
test('claim conflict cannot steal another staff assignment',async()=>{
  const f=fixture();const t=f.create();t.claimedBy='other';f.store.saveMail(t);f.i.options.getSubcommand=()=> 'claim';await assert.rejects(f.service.action(f.i,f.c),/Already claimed/);f.store.close();
});
test('modmail state persists and legacy ticket rows survive migration',()=>{
  const dir=mkdtempSync(join(tmpdir(),'mail-test-'));const path=join(dir,'db');let s=new MailStore(path);
  const old=s.create('guild','legacy',{});const t=s.createMail('guild','owner');s.block('guild','owner',true);s.event(t,'source','incoming','owner','hello','delivered');s.close();
  s=new MailStore(path);assert.equal(s.get(old.id).owner,'legacy');assert.equal(s.active('guild','owner').id,t.id);assert.equal(s.source('source').status,'delivered');assert.equal(s.blocked('guild','owner'),true);s.close();rmSync(dir,{recursive:true});
});
test('startup recovers interrupted channel creation',async()=>{
  const f=fixture();const t=f.store.createMail('guild','owner');f.channel.topic=`THAI modmail #${t.id} | Member owner | Use /modmail reply`;await f.service.reconcile(f.guild);assert.equal(f.store.mail(t.id).channel,'channel');f.store.close();
});
