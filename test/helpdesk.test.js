import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PermissionFlagsBits as P, Collection } from 'discord.js';
import { Store, Locks } from '../src/store.js';
import { Helpdesk } from '../src/helpdesk.js';
import { canStaff, canAdmin, mayAccess } from '../src/content.js';
import { commands } from '../src/commands.js';
const config={supportRole:'support',adminRole:'admin',category:'category',logChannel:'logs'};
const member=(id,roles=[],administrator=false)=>({id,roles:{cache:new Map(roles.map(r=>[r,true]))},permissions:{has:()=>administrator}});
function fixture() {
  const store=new Store(':memory:'); store.saveConfig('guild',config);
  const ticket=store.create('guild','owner',{kind:'general',answers:[],adminOnly:false,participants:[],priority:'normal',claimedBy:null});
  ticket.channel='channel'; ticket.status='open'; store.save(ticket);
  const sent=[],replies=[],permissions=[];
  const channel={id:'channel',send:async p=>sent.push(p),permissionOverwrites:{set:async p=>permissions.push(p)},delete:async()=>{channel.deleted=true;},messages:{fetch:async()=>new Collection()}};
  const helpdesk=new Helpdesk({user:{id:'bot'}},store);
  const i={guildId:'guild',channelId:'channel',channel,user:{id:'staff'},member:member('staff',['support']),guild:{id:'guild',channels:{fetch:async()=>({isTextBased:()=>true,send:async()=>{}})}},editReply:async p=>replies.push(p)};
  return {store,ticket,helpdesk,i,channel,sent,replies,permissions};
}
test('commands serialize and expose required setup, panel and ticket actions',()=>{
  assert.ok(commands.find(c=>c.name==='setup'));
  assert.ok(commands.find(c=>c.name==='panel'));
  assert.equal(commands.find(c=>c.name==='ticket').options.length,13);
});
test('support cannot access confidential staff tickets, admins can',()=>{
  const t={owner:'owner',adminOnly:true,participants:[]};
  assert.equal(canStaff(member('s',['support']),config,t),false);
  assert.equal(mayAccess(member('s',['support']),config,t),false);
  assert.equal(canAdmin(member('a',['admin']),config),true);
  assert.equal(mayAccess(member('owner'),config,t),true);
  assert.equal(mayAccess(member('a',['admin']),config,t),true);
});
test('state survives process/store restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'thai-test-')); const file=join(dir,'db.sqlite');
  let s=new Store(file); s.saveConfig('g',config); const t=s.create('g','u',{participants:[]}); t.channel='c';t.status='open'; s.save(t);s.audit(t,'u','Opened');s.close();
  s=new Store(file); assert.equal(s.ticket('c').owner,'u');assert.equal(s.config('g').supportRole,'support');assert.equal(s.history(t).length,1);s.close();rmSync(dir,{recursive:true});
});
test('guild mutation queue serializes and recovers after errors',async()=>{
  const locks=new Locks(), order=[];
  await Promise.allSettled([locks.run('g',async()=>{order.push(1);await Promise.resolve();throw Error('expected');}),locks.run('g',async()=>order.push(2))]);
  assert.deepEqual(order,[1,2]);assert.equal(locks.queue.size,0);
});
test('nonstaff cannot claim a ticket',async()=>{
  const {helpdesk,i,store}=fixture();i.user.id='owner';i.member=member('owner');
  await assert.rejects(helpdesk.action(i,'claim',config),/requires/);assert.equal(store.ticket('channel').claimedBy,null);store.close();
});
test('claim does not allow another staff member to steal assignment',async()=>{
  const {helpdesk,i,store}=fixture();await helpdesk.action(i,'claim',config);
  i.user.id='second';i.member=member('second',['support']);await assert.rejects(helpdesk.action(i,'claim',config),/already claimed/);assert.equal(store.ticket('channel').claimedBy,'staff');store.close();
});
test('close locks participant messages and reopen restores them',async()=>{
  const {helpdesk,i,store,permissions}=fixture();i.fields={getTextInputValue:()=> 'Resolved'};
  await helpdesk.action(i,'close',config);assert.equal(store.ticket('channel').status,'closed');assert.ok(permissions.at(-1).find(p=>p.id==='owner').deny.includes(P.SendMessages));
  await helpdesk.action(i,'reopen',config);assert.equal(store.ticket('channel').status,'open');assert.ok(permissions.at(-1).find(p=>p.id==='owner').allow.includes(P.SendMessages));store.close();
});
test('escalation revokes support and added participants',async()=>{
  const {helpdesk,i,store,permissions,ticket}=fixture();ticket.participants=['guest'];store.save(ticket);
  await helpdesk.action(i,'escalate',config);assert.equal(store.ticket('channel').adminOnly,true);assert.deepEqual(store.ticket('channel').participants,[]);
  assert.ok(permissions.at(-1).find(p=>p.id==='support').deny.includes(P.ViewChannel));assert.equal(permissions.at(-1).some(p=>p.id==='guest'),false);store.close();
});
test('deletion is blocked when transcript logging fails',async()=>{
  const {helpdesk,i,store,ticket,channel}=fixture();ticket.status='closed';store.save(ticket);i.member=member('staff',['admin']);i.customId='ticket:confirm-delete:staff';
  helpdesk.log=async()=>{throw Error('Upload failed');};
  await assert.rejects(helpdesk.action(i,'confirm-delete',config),/Upload failed/);assert.equal(channel.deleted,undefined);assert.equal(store.ticket('channel').status,'closed');store.close();
});
test('successful deletion archives first and requires matching confirmation user',async()=>{
  const {helpdesk,i,store,ticket,channel}=fixture();ticket.status='closed';store.save(ticket);i.member=member('staff',['admin']);i.customId='ticket:confirm-delete:other';
  await assert.rejects(helpdesk.action(i,'confirm-delete',config),/administrator who requested/);
  i.customId='ticket:confirm-delete:staff';let archived=false;
  helpdesk.log=async()=>{archived=true;assert.equal(channel.deleted,undefined);};
  await helpdesk.action(i,'confirm-delete',config);assert.equal(archived,true);assert.equal(channel.deleted,true);assert.equal(store.ticket('channel').status,'deleted');store.close();
});
test('duplicate opening limit prevents channel creation',async()=>{
  const {helpdesk,i,store}=fixture();store.create('guild','owner',{});i.user.id='owner';
  await assert.rejects(helpdesk.open(i,'general',config),/two active/);store.close();
});
test('transcripts paginate, preserve chronological order and include attachment URLs',async()=>{
  const {helpdesk,channel,ticket,store}=fixture();
  const message=(id)=>({id:String(id),createdTimestamp:id,author:{tag:'user',id:'owner'},content:`message-${id}`,embeds:[],attachments:new Collection(id===1?[['a',{url:'https://example.com/evidence.png'}]]:[])});
  let calls=0;channel.messages.fetch=async options=>{calls++;if(calls===1)return new Collection(Array.from({length:100},(_,n)=>[String(101-n),message(101-n)]));assert.equal(options.before,'2');return new Collection([['1',message(1)]]);};
  const file=await helpdesk.transcript(channel,ticket);const text=file.attachment.toString();assert.equal(calls,2);assert.ok(text.indexOf('message-1\n')<text.indexOf('message-101\n'));assert.ok(text.includes('https://example.com/evidence.png'));store.close();
});
test('startup recovers an interrupted ticket creation',async()=>{
  const {helpdesk,store}=fixture();const t=store.create('guild','owner',{participants:[]});
  const cache=new Collection([['channel',{id:'channel'}],['recovered',{id:'recovered',topic:`THAI ticket #${t.id} | Owner owner | general`}]]);
  await helpdesk.reconcile({id:'guild',channels:{fetch:async()=>{},cache}});assert.equal(store.get(t.id).channel,'recovered');assert.equal(store.get(t.id).status,'open');store.close();
});
