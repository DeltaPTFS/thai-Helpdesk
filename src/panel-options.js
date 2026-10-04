import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { thaiEmojis, resolveThaiEmojis } from './branding.js';

export async function panelOptions(i,saved={}) {
  const selected={...thaiEmojis,...saved.emojis};
  for(const [slot,option] of Object.entries({support:'heading_emoji',alliance:'alliance_emoji',general:'general_emoji',report:'report_emoji',staff:'staff_emoji',appeal:'appeal_emoji',partnership:'partnership_emoji'})) {
    const value=i.options?.getString(option);
    if(value!=null) selected[slot]=value.trim().toLowerCase()==='none' ? null : value.trim();
  }
  const emojis=await resolveThaiEmojis(i.guild,selected);
  const upload=i.options?.getAttachment('banner');
  const banner=upload ? await saveBanner(upload) : saved.banner;
  return {emojis,...(banner?{banner}:{})};
}

export async function saveBanner(upload, fetcher=fetch, directory=join(dirname(process.env.DATABASE_PATH || './data/helpdesk.sqlite'),'banners')) {
  const extensions={'image/png':'png','image/jpeg':'jpeg','image/gif':'gif','image/webp':'webp'};
  const extension=extensions[upload.contentType];
  if(!extension || upload.size>8*1024*1024) throw new Error('Upload a PNG, JPEG, GIF, or WebP banner no larger than 8 MB.');
  const url=new URL(upload.url);
  if(url.protocol!=='https:' || !['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)) throw new Error('Please upload your banner using the /panel banner attachment option.');
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok || !response.body) throw new Error('The banner upload could not be downloaded. Please attach it again.');
  const chunks=[];let size=0;
  for await(const chunk of response.body) {
    size+=chunk.length;
    if(size>8*1024*1024) throw new Error('Banner exceeds the 8 MB limit.');
    chunks.push(chunk);
  }
  if(!size) throw new Error('The banner image is empty. Please attach it again.');
  const name=`thai-banner-${randomUUID()}.${extension}`;
  await mkdir(directory,{recursive:true});
  const path=join(directory,name);await writeFile(path,Buffer.concat(chunks));
  return {path,name};
}
