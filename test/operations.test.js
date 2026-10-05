import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { MailStore } from '../src/mail-store.js';
import { Modmail } from '../src/modmail.js';
import { advancedAction,refreshInbox,maintain,rating,overdue,controls } from '../src/operations.js';
const staff=(role='support')=>({permissions:{has:()=>false},roles:{cache:new Map([[role,true]])}});
function fixture() {
  const store=new MailStore(':memory:'),responses=[],sent=[];
  const c={supportRole:'support',adminRole:'admin',responseMinutes:5,mailCategory:'category',mailLogs:'logs',mailInbox:'inbox'};store.saveConfig('guild',c);
  const channel={id:'channel',send:async p=>{sent.push(p);return {id:'dashboard'};},messages:{fetch:async()=>({author:{id:'bot'},edit:async p=>sent.push(p)})}};
  const guild={id:'guild',channels:{fetch:async()=>channel},members:{fetch:async()=>staff()}};
  const client={user:{id:'bot'},guilds:{cache:new Map([['guild',guild]])},users:{fetch:async()=>({send:async()=>{}})}};
  const service=new Modmail(client,store,'guild');
  const i={id:'source',guildId:'guild',channelId:'channel',guild,channel,user:{id:'staff'},member:staff(),editReply:async p=>responses.push(p),options:{getString:()=>null,getInteger:()=>null,getBoolean:()=>null}};
  function thread(owner,extra={}) {const t=store.createMail('guild',owner);Object.assign(t,{channel:`channel-${t.id}`,status:'open'},extra);store.saveMail(t);return t;}
  return {store,c,responses,sent,service,i,thread,guild,channel};
}
test('shared inbox omits admin-only conversations and their counts',async()=>{
  const f=fixture();f.thread('public');const secret=f.thread('secret',{adminOnly:true,priority:'urgent'});
  await refreshInbox(f.service,f.guild,f.c);const data=JSON.stringify(f.sent);
  assert.ok(data.includes('1 open'));assert.equal(data.includes(`<#${secret.channel}>`),false);f.store.close();
});
test('search and history cannot disclose restricted conversations to support',async()=>{
  const f=fixture();const t=f.thread('secret',{adminOnly:true,tags:['confidential']});f.store.event(t,'e','internal note','admin','confidential concern');
  f.i.options.getString=()=> 'confidential';await advancedAction(f.service,f.i,f.c,'search');assert.ok(JSON.stringify(f.responses).includes('No matching'));
  f.i.member=staff('admin');await advancedAction(f.service,f.i,f.c,'search');assert.ok(JSON.stringify(f.responses.at(-1)).includes(`<#${t.channel}>`));f.store.close();
});
test('statistics are permission-scoped and include only measured replies',async()=>{
  const f=fixture();f.thread('a',{firstResponseMs:120000,status:'closed',rating:5});f.thread('hidden',{adminOnly:true,firstResponseMs:600000,status:'closed',rating:1});
  await advancedAction(f.service,f.i,f.c,'stats');const text=JSON.stringify(f.responses);assert.ok(text.includes('2 min (1 measured)'));assert.ok(text.includes('5.0/5'));f.store.close();
});
test('queue sorts urgency first and filters assignments',async()=>{
  const f=fixture();const normal=f.thread('a',{priority:'normal'}),urgent=f.thread('b',{priority:'urgent',claimedBy:'staff'});
  await advancedAction(f.service,f.i,f.c,'inbox');let text=JSON.stringify(f.responses.at(-1));assert.ok(text.indexOf(`<#${urgent.channel}>`)<text.indexOf(`<#${normal.channel}>`));
  f.i.options.getString=()=> 'mine';await advancedAction(f.service,f.i,f.c,'inbox');text=JSON.stringify(f.responses.at(-1));assert.equal(text.includes(`<#${normal.channel}>`),false);f.store.close();
});
test('reminders persist their timestamp and do not repeat each timer tick',async()=>{
  const f=fixture();const t=f.thread('a',{waitingSince:Date.now()-360000});await maintain(f.service);await maintain(f.service);
  assert.equal(f.sent.filter(p=>p.embeds?.[0]?.data.title==='Response target exceeded').length,1);
  assert.ok(f.store.mail(t.id).lastReminder);f.store.close();
});
test('waiting for member and closed conversations never become overdue',()=>{
  assert.equal(overdue({status:'open',waitingSince:null},{responseMinutes:5}),false);
  assert.equal(overdue({status:'closed',waitingSince:1},{responseMinutes:5}),false);
});
test('feedback is owner-only, closed-only, valid-range and single submission',async()=>{
  const f=fixture();const t=f.thread('owner',{status:'closed'});f.i.customId=`mail:rate:${t.id}:5`;
  await assert.rejects(rating(f.service,f.i),/Only the member/);f.i.user.id='owner';await rating(f.service,f.i);assert.equal(f.store.mail(t.id).rating,5);
  await assert.rejects(rating(f.service,f.i),/already/);f.store.close();
});
test('pending deliveries become uncertain after restart; no blind resend',()=>{
  const f=fixture();const t=f.thread('a');f.store.event(t,'pending','outgoing','staff','text','pending');f.store.recoverDeliveries('guild');assert.equal(f.store.source('pending').status,'uncertain');assert.equal(f.sent.length,0);f.store.close();
});
test('priority and tags persist; invalid tags cannot inject formatting',async()=>{
  const f=fixture();const t=f.thread('a');f.i.channelId=t.channel;f.i.options.getString=()=> 'urgent';await advancedAction(f.service,f.i,f.c,'priority');assert.equal(f.store.mail(t.id).priority,'urgent');
  f.i.id='tag';f.i.options.getString=()=> 'flight-help';await advancedAction(f.service,f.i,f.c,'tag');assert.deepEqual(f.store.mail(t.id).tags,['flight-help']);
  f.i.options.getString=()=> '@everyone';await assert.rejects(advancedAction(f.service,f.i,f.c,'tag'),/lowercase/);f.store.close();
});
test('assignment and response settings require admin privileges',async()=>{
  const f=fixture();const t=f.thread('a');f.i.channelId=t.channel;
  await assert.rejects(advancedAction(f.service,f.i,f.c,'assign'),/Only admins/);await assert.rejects(advancedAction(f.service,f.i,f.c,'settings'),/Only admins/);f.store.close();
});
test('closed conversation controls cannot offer reply or close',()=>{
  const buttons=controls({id:1,status:'closed'}).toJSON().components;assert.equal(buttons.find(b=>b.label==='Details').disabled,false);assert.equal(buttons.find(b=>b.label==='Reply').disabled,true);
});
test('successful reply clears wait state and captures first response; failed delivery does neither',async()=>{
  const f=fixture();const t=f.thread('a',{waitingSince:Date.now()-60000,firstReceivedAt:Date.now()-60000});f.i.channelId=t.channel;
  f.service.client.users.fetch=async()=>({send:async()=>{throw {code:50007};}});await assert.rejects(f.service.reply(f.i,t,'hi'));
  assert.ok(f.store.mail(t.id).waitingSince);assert.equal(f.store.mail(t.id).firstResponseMs,undefined);
  f.i.id='retry';f.service.client.users.fetch=async()=>({send:async()=>{}});await f.service.reply(f.i,t,'hi');const saved=f.store.mail(t.id);assert.equal(saved.waitingSince,null);assert.ok(saved.firstResponseMs>=60000);f.store.close();
});
