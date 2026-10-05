import { ActionRowBuilder as Row,ButtonBuilder as Button,ButtonStyle,EmbedBuilder,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle } from 'discord.js';
import { canAdmin,canStaff } from './content.js';
const silent={parse:[]};
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
const colors={low:0x94a3b8,normal:0x653cba,high:0xe6a23c,urgent:0xd64550};
export function overdue(t,c,now=Date.now()) {return t.status==='open' && Boolean(t.waitingSince) && now-t.waitingSince>=(c.responseMinutes??60)*60000;}
export function visibleThreads(store,guild,member,c) {return store.archive(guild).filter(t=>canStaff(member,c,t));}
function duration(ms) {return ms==null?'—':`${Math.max(0,Math.round(ms/60000))} min`;}
export function summary(t,c) {
  return new EmbedBuilder().setColor(colors[t.priority??'normal']).setTitle(`THAI | Conversation ${String(t.id).padStart(4,'0')}`)
    .setDescription('**Staff workspace**\nUse Reply to message the member. Notes and ordinary channel messages stay internal.')
    .addFields(
      {name:'Member',value:`<@${t.owner}>`,inline:true},
      {name:'State',value:t.status==='closed'?'Closed':t.waitingSince?'Waiting for staff':'Waiting for member',inline:true},
      {name:'Priority',value:t.priority??'normal',inline:true},
      {name:'Assigned',value:t.claimedBy?`<@${t.claimedBy}>`:'Unclaimed',inline:true},
      {name:'Response target',value:overdue(t,c)?'OVERDUE':`${c.responseMinutes??60} min`,inline:true},
      {name:'Access',value:t.adminOnly?'Admins only':'Support team',inline:true},
      {name:'Tags',value:t.tags?.join(', ')||'None'})
    .setFooter({text:'Thai Airways Customer Care • Modmail'}).setTimestamp();
}
export function controls(t) {
  const row=new Row();
  for(const [key,label,style,emoji] of [['reply','Reply',ButtonStyle.Primary],['note','Private note',ButtonStyle.Secondary],['claim','Claim',ButtonStyle.Success,'✅'],['close','Close',ButtonStyle.Danger,'❌'],['info','Details',ButtonStyle.Secondary]]) {
    const button=new Button().setCustomId(`mail:${key}:${t.id}`).setLabel(label).setStyle(style).setDisabled(t.status!=='open' && key!=='info');
    if(emoji)button.setEmoji(emoji);row.addComponents(button);
  }
  return row;
}
export function feedbackRow(t) {return new Row().addComponents(...[1,2,3,4,5].map(n=>new Button().setCustomId(`mail:rate:${t.id}:${n}`).setLabel(String(n)).setStyle(ButtonStyle.Secondary)));}
function queuePayload(threads,c,page=1,heading='Staff inbox') {
  const open=threads.filter(t=>t.status==='open').sort((a,b)=>({urgent:4,high:3,normal:2,low:1}[b.priority??'normal']-({urgent:4,high:3,normal:2,low:1}[a.priority??'normal']) || (a.waitingSince??Infinity)-(b.waitingSince??Infinity) || a.created-b.created));
  const pages=Math.max(1,Math.ceil(open.length/10));page=Math.min(page,pages);
  const lines=open.slice((page-1)*10,page*10).map(t=>`**#${t.id} · ${t.priority??'normal'}${overdue(t,c)?' · OVERDUE':''}** <#${t.channel}>\n${t.claimedBy?`Assigned <@${t.claimedBy}>`:'Unclaimed'} · ${t.waitingSince?`Waiting ${duration(Date.now()-t.waitingSince)}`:'Waiting for member'}`);
  return {embeds:[new EmbedBuilder().setColor(0x653cba).setTitle(`THAI | ${heading}`).setDescription(lines.join('\n\n')||'No matching open conversations.').setFooter({text:`${open.length} open • Page ${page}/${pages} • Internal target ${c.responseMinutes??60} min`})],allowedMentions:silent};
}
export async function ensureInbox(service,i,c) {
  let channel=c.mailInbox && i.guild.channels.cache.get(c.mailInbox);
  if(!channel || channel.type!==ChannelType.GuildText) channel=await i.guild.channels.create({name:'modmail-inbox',type:ChannelType.GuildText,parent:c.mailCategory,permissionOverwrites:service.permissions(i.guild,c)});
  else await channel.permissionOverwrites.set(service.permissions(i.guild,c));
  c.mailInbox=channel.id;service.inboxFingerprint=null;service.store.saveConfig(i.guildId,c);await refreshInbox(service,i.guild,c);
}
export async function refreshInbox(service,guild,c) {
  if(!c.mailInbox)return;
  // Shared staff dashboard must NEVER list admin-only conversations, even as counts.
  const payload=queuePayload(service.store.mails(guild.id).filter(t=>!t.adminOnly),c,1,'Support inbox');
  const fingerprint=JSON.stringify(payload.embeds.map(e=>e.toJSON()));
  if(service.inboxFingerprint===fingerprint)return;
  const channel=await guild.channels.fetch(c.mailInbox);let message;
  if(c.inboxMessage) {try {message=await channel.messages.fetch(c.inboxMessage);}catch(e){if(e.code!==10008)throw e;}}
  if(message?.author?.id===service.client.user.id) await message.edit(payload);
  else {message=await channel.send(payload);c.inboxMessage=message.id;service.store.saveConfig(guild.id,c);}
  service.inboxFingerprint=fingerprint;
}
export async function refreshCard(service,channel,t,c) {
  if(!t.controlMessage)return;
  try {const message=await channel.messages.fetch(t.controlMessage);await message.edit({embeds:[summary(t,c)],components:[controls(t)],allowedMentions:silent});}
  catch { /* A deleted control card can be regenerated with /modmail controls. */ }
}
export async function maintain(service) {
  const guild=service.client.guilds.cache.get(service.guildId),c=service.store.config(service.guildId);if(!guild || !c?.mailCategory)return;
  for(const t of service.store.mails(guild.id)) {
    if(!overdue(t,c) || Date.now()-(t.lastReminder??0)<3600000)continue;
    try {
      const channel=await guild.channels.fetch(t.channel);
      await channel.send({embeds:[new EmbedBuilder().setColor(0xe6a23c).setTitle('Response target exceeded').setDescription(`Conversation #${t.id} has waited ${duration(Date.now()-t.waitingSince)} for staff. Target: ${c.responseMinutes??60} min. No member notification was sent.`)],allowedMentions:silent});
      t.lastReminder=Date.now();service.store.saveMail(t);await refreshCard(service,channel,t,c);
    } catch(e) {console.error('Modmail reminder failed:',e.code??e.name);}
  }
  await refreshInbox(service,guild,c);
}
export async function advancedAction(service,i,c,action) {
  const store=service.store;
  if(!['inbox','search','history','stats','settings','priority','tag','assign','controls','deliveries'].includes(action))return false;
  assert(canStaff(i.member,c,null),'Only support staff can use this command.');
  if(action==='settings') {
    assert(canAdmin(i.member,c),'Only admins can change response targets.');
    c.responseMinutes=i.options.getInteger('response_minutes',true);
    const feedback=i.options.getBoolean('feedback');if(feedback!==null)c.feedback=feedback;
    store.saveConfig(i.guildId,c);await service.respond(i,`✅ Internal response target: ${c.responseMinutes} minutes. Feedback surveys: ${c.feedback===false?'off':'on'}.`);return true;
  }
  if(['inbox','search','history','stats'].includes(action)) {
    let threads=visibleThreads(store,i.guildId,i.member,c);const page=i.options.getInteger?.('page')??1;
    if(action==='inbox') {
      const filter=i.options.getString('filter')??'all';
      if(filter==='mine')threads=threads.filter(t=>t.claimedBy===i.user.id);
      if(filter==='unclaimed')threads=threads.filter(t=>!t.claimedBy);
      if(filter==='overdue')threads=threads.filter(t=>overdue(t,c));
      await service.respond(i,queuePayload(threads,c,page));return true;
    }
    if(action==='stats') {
      const closed=threads.filter(t=>t.status==='closed'),timed=threads.filter(t=>t.firstResponseMs!=null),ratings=closed.filter(t=>t.rating);
      const avg=timed.length?duration(timed.reduce((n,t)=>n+t.firstResponseMs,0)/timed.length):'No data';
      await service.respond(i,{embeds:[new EmbedBuilder().setColor(0x653cba).setTitle('THAI | Service performance').setDescription(`**Open:** ${threads.filter(t=>t.status==='open').length}\n**Overdue:** ${threads.filter(t=>overdue(t,c)).length}\n**Closed:** ${closed.length}\n**Average first response:** ${avg} (${timed.length} measured)\n**Satisfaction:** ${ratings.length?(ratings.reduce((n,t)=>n+t.rating,0)/ratings.length).toFixed(1)+'/5':'No ratings'} (${ratings.length} responses)\n\nAll-time metrics for conversations you can access. New response-time measurements start with this upgrade.`)],allowedMentions:silent});return true;
    }
    if(action==='history')threads=threads.filter(t=>t.owner===i.options.getUser('user',true).id);
    else {const query=i.options.getString('query',true),ids=store.searchIds(i.guildId,query);threads=threads.filter(t=>ids.has(t.id)||t.tags?.some(tag=>tag.includes(query.toLowerCase())));}
    const pages=Math.max(1,Math.ceil(threads.length/10)),actual=Math.min(page,pages);
    const result=threads.slice((actual-1)*10,actual*10).map(t=>`**#${t.id}** · ${t.status} · ${t.priority??'normal'} · <#${t.channel}>\nMember <@${t.owner}> · Tags: ${t.tags?.join(', ')||'none'}`).join('\n\n');
    await service.respond(i,{embeds:[new EmbedBuilder().setColor(0x653cba).setTitle(action==='history'?'Member history':'Conversation search').setDescription(result||'No matching conversations.').setFooter({text:`${threads.length} results • Page ${actual}/${pages}`})],allowedMentions:silent});return true;
  }
  const t=store.byChannel(i.channelId);assert(t && t.guild===i.guildId && canStaff(i.member,c,t),'You cannot access this conversation.');
  if(action==='deliveries') {
    const events=store.events(t).filter(e=>['incoming','outgoing'].includes(e.kind)).slice(-15).reverse();
    await service.respond(i,{embeds:[new EmbedBuilder().setColor(0x653cba).setTitle(`Delivery log • #${t.id}`).setDescription(events.map(e=>`**${e.kind} · ${e.status}** — <t:${Math.floor(e.created/1000)}:R>\nRecord ${e.id}`).join('\n\n')||'No deliveries yet.').setFooter({text:'Uncertain may mean partial delivery. No automatic retries.'})]});return true;
  }
  if(action==='controls') {
    const message=await i.channel.send({embeds:[summary(t,c)],components:[controls(t)],allowedMentions:silent});t.controlMessage=message.id;store.saveMail(t);
    await service.respond(i,'✅ Conversation controls posted.');return true;
  }
  assert(t.status==='open','This conversation is closed.');let detail;
  if(action==='priority') {t.priority=i.options.getString('level',true);assert(colors[t.priority],'Unknown priority.');detail=`Priority set to ${t.priority}`;}
  if(action==='tag') {
    const tag=i.options.getString('label',true).toLowerCase().trim();assert(/^[a-z0-9-]{1,24}$/.test(tag),'Use only lowercase letters, numbers, and hyphens in tags.');
    const tags=new Set(t.tags??[]);if(i.options.getBoolean('remove'))tags.delete(tag);else tags.add(tag);assert(tags.size<=5,'A conversation can have at most five tags.');t.tags=[...tags];detail=`Tags: ${t.tags.join(', ')||'none'}`;
  }
  if(action==='assign') {
    assert(canAdmin(i.member,c),'Only admins can reassign conversations.');const user=i.options.getUser('user',true),member=await i.guild.members.fetch(user.id);
    assert(!user.bot && canStaff(member,c,t),'Select a human staff member who can access this conversation.');t.claimedBy=user.id;detail=`Assigned to ${user.id}`;
  }
  store.saveMail(t);store.event(t,i.id,'action',i.user.id,detail);await refreshCard(service,i.channel,t,c);await service.respond(i,`✅ ${detail}`);return true;
}
export async function rating(service,i) {
  const [,action,id,value]=i.customId.split(':');assert(action==='rate','Invalid feedback action.');
  const t=service.store.mail(Number(id)),score=Number(value);
  assert(t && t.guild===service.guildId && t.owner===i.user.id && t.status==='closed','Only the member in this closed conversation can submit feedback.');
  assert(Number.isInteger(score)&&score>=1&&score<=5,'Choose a rating from 1 to 5.');assert(!t.rating,'Your feedback has already been recorded.');
  t.rating=score;t.ratedAt=Date.now();service.store.saveMail(t);service.store.event(t,i.id,'feedback',i.user.id,`${score}/5`);
  await service.respond(i,'✅ Thank you. Your feedback has been recorded.');
}
export function staffModal(i,t) {
  const action=i.customId.split(':')[1];
  const titles={reply:'Reply to member',note:'Private staff note',close:'Close conversation'};
  return new ModalBuilder().setCustomId(`mail:submit-${action}:${t.id}`).setTitle(titles[action]).addComponents(new Row().addComponents(new TextInputBuilder().setCustomId('text').setLabel(action==='close'?'Closure reason (sent to member)':action==='note'?'Internal note (staff only)':'Message to send to the member').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(action==='close'?1000:3500)));
}
