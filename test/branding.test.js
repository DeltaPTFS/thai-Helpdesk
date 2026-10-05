import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Collection, MessageFlags, ChannelType } from 'discord.js';
import { buildPanel, bannerPath } from '../src/branding.js';

import { Store } from '../src/store.js';


test('panel uses attachment banner above text card and DM contact button',()=>{
  const panel=buildPanel('123456789012345678'), components=panel.components.map(c=>c.toJSON());
  assert.equal(panel.flags,MessageFlags.IsComponentsV2);
  assert.deepEqual(components.map(c=>c.type),[12,17,1]);
  assert.equal(components[0].items[0].media.url,'attachment://thai-assistance-banner.jpeg');
  assert.equal(panel.files[0].name,'thai-assistance-banner.jpeg');
  assert.equal(readFileSync(bannerPath).subarray(0,2).toString('hex'),'ffd8');
  const text=components[1].components[0].content;
  assert.ok(text.startsWith('**Customer Assistance**'));
  assert.ok(text.includes('**@Thai Airways Customer Care**'));

  assert.equal(/<a?:\w+:\d+>/.test(text),false);
  assert.deepEqual(panel.allowedMentions,{parse:[]});
  const button=components[2].components[0];assert.equal(button.style,5);assert.equal(button.url,'https://discord.com/users/123456789012345678');
  assert.equal(button.custom_id,undefined);assert.ok(text.includes('direct message'));
});
test('bot authored sources contain only check and cross emojis',()=>{
  for(const file of readdirSync(new URL('../src/',import.meta.url)).filter(f=>f.endsWith('.js'))) {
    assert.equal(/\p{Extended_Pictographic}/u.test(readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8').replace(/[✅❌]/gu,'')),false,file);
  }
});
