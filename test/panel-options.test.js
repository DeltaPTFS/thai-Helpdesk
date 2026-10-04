import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Collection } from 'discord.js';
import { panelOptions,saveBanner } from '../src/panel-options.js';
import { buildPanel } from '../src/branding.js';
import { commands } from '../src/commands.js';
const emoji={id:'1555047347573096000',name:'thai_help',animated:true,available:true,usable:true};
const interaction=values=>({guild:{emojis:{fetch:async()=>new Collection([[emoji.id,emoji]])}},options:{getString:n=>values[n]??null,getAttachment:()=>null}});
test('panel exposes banner and every emoji position',()=>{
  assert.deepEqual(commands.find(c=>c.name==='panel').options.map(o=>o.name),['banner','heading_emoji','alliance_emoji','general_emoji','report_emoji','staff_emoji','appeal_emoji','partnership_emoji']);
});
test('replacement emoji options bypass obsolete defaults, persist and allow blank slots',async()=>{
  const result=await panelOptions(interaction({heading_emoji:`<a:thai_help:${emoji.id}>`,alliance_emoji:'none',report_emoji:':thai_help:',staff_emoji:'none'}));
  assert.equal(result.emojis.support.id,emoji.id);assert.equal(result.emojis.support.animated,true);assert.equal(result.emojis.alliance,null);
  const again=await panelOptions(interaction({}),result);assert.deepEqual(again,result);
  const rows=buildPanel(result.emojis).components.map(c=>c.toJSON());
  assert.equal(rows[2].components[0].options.find(o=>o.value==='staff').emoji,undefined);
  assert.equal(rows[2].components[0].options.find(o=>o.value==='report').emoji.id,emoji.id);
});
test('unicode and foreign custom emojis are rejected',async()=>{
  await assert.rejects(panelOptions(interaction({heading_emoji:'not_a_server_emoji',alliance_emoji:'none'})),/unavailable/);
});
test('banner is stored locally and reused without an expiring CDN URL',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'thai-banner-test-'));
  try {
    const bytes=Buffer.from([255,216,255,217]);
    const banner=await saveBanner({contentType:'image/jpeg',size:4,url:'https://cdn.discordapp.com/attachments/test'},async()=>new Response(bytes),dir);
    assert.deepEqual(await readFile(banner.path),bytes);
    const saved={banner,emojis:{support:null,alliance:null}};
    assert.deepEqual((await panelOptions(interaction({}),saved)).banner,banner);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('invalid banners are rejected before download',async()=>{
  const fetcher=()=>{throw Error('unexpected request');};
  await assert.rejects(saveBanner({contentType:'text/html',size:10},fetcher),/PNG/);
  await assert.rejects(saveBanner({contentType:'image/png',size:9*1024*1024},fetcher),/8 MB/);
  await assert.rejects(saveBanner({contentType:'image/png',size:10,url:'http://localhost/banner'},fetcher),/attachment option/);
});
