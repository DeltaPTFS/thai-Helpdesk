import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Collection, MessageFlags, ChannelType } from 'discord.js';
import { buildPanel, bannerPath } from '../src/branding.js';
import { Helpdesk } from '../src/helpdesk.js';
import { Store } from '../src/store.js';


test('panel uses attachment banner above text card and working ticket dropdown',()=>{
  const panel=buildPanel(), components=panel.components.map(c=>c.toJSON());
  assert.equal(panel.flags,MessageFlags.IsComponentsV2);
  assert.deepEqual(components.map(c=>c.type),[12,17,1]);
  assert.equal(components[0].items[0].media.url,'attachment://thai-assistance-banner.jpeg');
  assert.equal(panel.files[0].name,'thai-assistance-banner.jpeg');
  assert.equal(readFileSync(bannerPath).subarray(0,2).toString('hex'),'ffd8');
  const text=components[1].components[0].content;
  assert.ok(text.startsWith('**Customer Assistance**'));
  assert.ok(text.includes('**@Thai Airways Customer Care**'));
  assert.ok(text.includes('**24 hours a day, 7 days a week**'));
  assert.equal(/<a?:\w+:\d+>/.test(text),false);
  assert.deepEqual(panel.allowedMentions,{parse:[]});
  const menu=components[2].components[0];assert.equal(menu.custom_id,'ticket:open');assert.equal(menu.options.length,5);
  for(const option of menu.options) assert.equal(option.emoji,undefined);
});
test('bot authored sources contain only check and cross emojis',()=>{
  for(const file of readdirSync(new URL('../src/',import.meta.url)).filter(f=>f.endsWith('.js'))) {
    assert.equal(/\p{Extended_Pictographic}/u.test(readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8').replace(/[✅❌]/gu,'')),false,file);
  }
});
test('repeated panel command edits the tracked message instead of duplicating it',async()=>{
  const store=new Store(':memory:');let sends=0,edits=0;
  const config={adminRole:'admin'};store.saveConfig('guild',config);
  const message={id:'panel',author:{id:'bot'},edit:async payload=>{edits++;assert.deepEqual(payload.attachments,[]);}};
  const i={guildId:'guild',channelId:'channel',member:{permissions:{has:()=>true}},guild:{emojis:{fetch:async()=>{throw Error('Emoji access should not be required');}}},channel:{type:ChannelType.GuildText,send:async()=>{sends++;return message;},messages:{fetch:async()=>message}},editReply:async()=>{}};
  const helpdesk=new Helpdesk({user:{id:'bot'}},store);
  await helpdesk.panel(i,config);await helpdesk.panel(i,store.config('guild'));
  assert.equal(sends,1);assert.equal(edits,1);assert.equal(store.config('guild').panels.channel,'panel');store.close();
});
