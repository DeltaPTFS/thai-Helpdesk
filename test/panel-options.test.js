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
test('panel exposes only optional banner upload',()=>{
  assert.deepEqual(commands.find(c=>c.name==='panel').options.map(o=>o.name),['banner']);
});
test('legacy emoji choices cannot block posting and are discarded',async()=>{
  const i={options:{getAttachment:()=>null},guild:{emojis:{fetch:async()=>{throw Error('Must not fetch emojis');}}}};
  const result=await panelOptions(i,{emojis:{support:{id:'unavailable'},alliance:{id:'missing'}}});
  assert.deepEqual(result,{});
  const components=buildPanel().components.map(c=>c.toJSON());
  assert.equal(JSON.stringify(components).includes('emoji'),false);
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
