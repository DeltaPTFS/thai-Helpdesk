import { AttachmentBuilder, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { Locks } from './store.js';
import { canAdmin, canStaff, templates } from './content.js';
import { buildPanel } from './branding.js';
import { panelOptions } from './panel-options.js';
const silent={parse:[]};
const allow=[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.AttachFiles,P.EmbedLinks];
const check=(condition,message)=>{if(!condition) throw new Error(message);};
const card=(title,description)=>new EmbedBuilder().setColor(0x653cba).setTitle(title).setDescription(description).setTimestamp();
export function messageBody(message) {
  const parts=[message.content || '',...[...message.attachments.values()].map(a=>`Attachment: ${a.url}`)];
  if(message.stickers?.size) parts.push('A sticker was sent. Please ask the member to describe it in text.');
  return parts.filter(Boolean).join('\n\n');
}
export async function sendText(target,text,source) {
  // Stable nonces reduce duplicate sends if Discord retries an in-flight request.
  for(let pos=0,index=0;pos<text.length;pos+=1800,index++) {
    await target.send({content:text.slice(pos,pos+1800),allowedMentions:silent,...(source?{nonce:`${source}-${index}`,enforceNonce:true}:{})});
  }
}

export class Modmail {
  locks=new Locks(); limits=new Map();
  constructor(client,store,guildId) {this.client=client;this.store=store;this.guildId=guildId;}
  respond(i,content) { return i.editReply(typeof content==='string'?{content,allowedMentions:silent}:content); }
  permissions(guild,c,adminOnly=false) {
    return [{id:guild.id,deny:[P.ViewChannel]},{id:this.client.user.id,allow:[...allow,P.ManageChannels,P.ManageMessages]},
      {id:c.adminRole,allow},{id:c.supportRole,...(adminOnly?{deny:[P.ViewChannel]}:{allow})}];
  }
  async setup(i) {
    check(i.member.permissions.has(P.Administrator),'Only a server administrator can run /setup.');
    const me=await i.guild.members.fetchMe();
    check(me.permissions.has([P.ManageChannels,P.ManageRoles,...allow]),'Give the bot Manage Channels, Manage Roles, View Channels, Send Messages, Read Message History, Attach Files, and Embed Links.');
    await i.guild.roles.fetch();await i.guild.channels.fetch();
    const c=this.store.config(i.guildId) ?? {};
    for(const [key,name] of [['supportRole','Support'],['adminRole','Ticket Admin']]) {
      let role=c[key] && i.guild.roles.cache.get(c[key]);
      if(!role) role=await i.guild.roles.create({name:key==='adminRole'?'Modmail Admin':name,colors:{primaryColor:0x653cba},permissions:[],reason:'Modmail setup'});
      c[key]=role.id;this.store.saveConfig(i.guildId,c);
    }
    let category=c.mailCategory && i.guild.channels.cache.get(c.mailCategory);
    if(!category || category.type!==ChannelType.GuildCategory) category=await i.guild.channels.create({name:'Modmail',type:ChannelType.GuildCategory,permissionOverwrites:this.permissions(i.guild,c)});
    else await category.permissionOverwrites.set(this.permissions(i.guild,c));
    c.mailCategory=category.id;this.store.saveConfig(i.guildId,c);
    let logs=c.mailLogs && i.guild.channels.cache.get(c.mailLogs);
    if(!logs || logs.type!==ChannelType.GuildText) logs=await i.guild.channels.create({name:'modmail-logs',type:ChannelType.GuildText,parent:category.id,permissionOverwrites:this.permissions(i.guild,c,true)});
    else await logs.permissionOverwrites.set(this.permissions(i.guild,c,true));
    c.mailLogs=logs.id;this.store.saveConfig(i.guildId,c);
    await this.respond(i,`✅ Modmail is ready.\nSupport: <@&${c.supportRole}>\nAdmins: <@&${c.adminRole}>\nPrivate category: **Modmail**\nArchive: <#${c.mailLogs}>\n\nAssign staff roles, then run /panel in your assistance channel. Members DM this bot; staff use /modmail reply. Ordinary staff-channel messages are internal. Existing ticket channels and history have been retained.`);
  }
  async panel(i,c) {
    check(canAdmin(i.member,c),'Only a modmail administrator can post the panel.');
    check(i.channel.type===ChannelType.GuildText,'Post the panel in a regular server text channel.');
    const branding=await panelOptions(i,c.panelBranding?.[i.channelId]);
    const payload=buildPanel(this.client.user.id,branding.banner);
    let message;
    if(c.panels?.[i.channelId]) {
      try {message=await i.channel.messages.fetch(c.panels[i.channelId]);}
      catch(e) {if(e.code!==10008) throw e;}
    }
    if(message?.author.id===this.client.user.id) await message.edit({...payload,content:null,embeds:[],attachments:[]});
    else message=await i.channel.send(payload);
    c.panels={...c.panels,[i.channelId]:message.id};c.panelBranding={...c.panelBranding,[i.channelId]:branding};
    this.store.saveConfig(i.guildId,c);await this.respond(i,'✅ Modmail panel ready. Members can open the bot profile and send a direct message.');
  }
  async log(guild,c,title,body,files=[]) {
    const channel=await guild.channels.fetch(c.mailLogs);
    check(channel?.isTextBased(),'Modmail logs are missing. Ask an administrator to run /setup.');
    return channel.send({embeds:[card(title,body)],files,allowedMentions:silent});
  }
  rateLimit(owner) {
    const now=Date.now();
    for(const [id,entry] of this.limits) if(now-entry.start>60000) this.limits.delete(id);
    const entry=this.limits.get(owner) ?? {start:now,count:0};entry.count++;this.limits.set(owner,entry);
    return entry.count<=10;
  }
  async onMessage(message) {
    // No guild message, bot message, or internal note is ever automatically relayed.
    if(message.author.bot || message.guildId || message.channel.type!==ChannelType.DM) return;
    if(!this.rateLimit(message.author.id)) {
      if(this.limits.get(message.author.id).count===11) await message.reply({content:'❌ Please wait a minute before sending more messages. Your latest message was not forwarded.',allowedMentions:silent}).catch(()=>{});
      return;
    }
    await this.locks.run(this.guildId,async()=>{
      try {
        const guild=this.client.guilds.cache.get(this.guildId),c=this.store.config(this.guildId);
        check(guild && c?.mailCategory && c?.mailLogs,'Modmail is not ready yet. Please ask a server administrator to run /setup. Your message was not forwarded.');
        check(!this.store.blocked(this.guildId,message.author.id),'You cannot contact this modmail service at the moment. Your message was not forwarded.');
        try {await guild.members.fetch(message.author.id);} catch(e) {if(e.code===10007) throw new Error('You must be a member of this server to contact its modmail team.');throw e;}
        if(this.store.source(message.id)) return;
        const body=messageBody(message);
        check(body,'Please send a text message or attachment so staff can help.');
        let t=this.store.active(this.guildId,message.author.id),fresh=false;
        if(t?.channel) {
          try {await guild.channels.fetch(t.channel);} catch(e) {if(e.code!==10003) throw e;t.status='missing';this.store.saveMail(t);t=null;}
        }
        if(!t) {t=this.store.createMail(this.guildId,message.author.id);fresh=true;}
        let channel;
        if(!t.channel) {
          channel=await guild.channels.create({name:`mail-${String(t.id).padStart(4,'0')}`,type:ChannelType.GuildText,parent:c.mailCategory,
            topic:`THAI modmail #${t.id} | Member ${t.owner} | Use /modmail reply; regular messages are internal`,permissionOverwrites:this.permissions(guild,c,t.adminOnly)});
          t.channel=channel.id;t.status='open';this.store.saveMail(t);fresh=true;
          await channel.send({embeds:[card(`Modmail #${t.id}`,`Member: <@${t.owner}> (${t.owner})\nUse **/modmail reply** to send a DM. Normal messages and /modmail note are staff-only.\nUse /modmail close to archive. Never add the member to this channel.`)],allowedMentions:silent});
        } else channel=await guild.channels.fetch(t.channel);
        const event=this.store.event(t,message.id,'incoming',message.author.id,body,'pending');
        try {await sendText(channel,`**Member • ${message.author.id} • Mail #${t.id}**\n${body}`,message.id);this.store.delivered(event,'delivered');}
        catch(e) {this.store.delivered(event,'uncertain');throw e;}
        await message.reply({content:fresh?'✅ Your message has been sent to Thai Airways Customer Care. Your messages and attachment links are visible to our support team and server administrators. Staff replies will arrive through this bot. Keep DMs enabled.':'✅ Your message was forwarded to Customer Care.',allowedMentions:silent}).catch(()=>{});
      } catch(e) {
        console.error('Incoming modmail failed:',e.code ?? e.name);
        await message.reply({content:`❌ ${e.code?'We could not confirm delivery to staff. Please try again later.':e.message}`,allowedMentions:silent}).catch(()=>{});
      }
    });
  }
  async transcript(channel,t) {
    const events=this.store.events(t).map(e=>`[${new Date(e.created).toISOString()}] ${e.kind} | ${e.status} | actor ${e.actor}\n${e.body}\n`).join('\n');
    let text=`THAI MODMAIL #${t.id} — STAFF ONLY\nMember: ${t.owner}\nStatus: ${t.status}\nContains internal notes; do not send to members.\n\nRecorded deliveries and actions\n${events}\nRetained staff-channel messages\n`;
    let before,count=0;
    while(true) {
      const batch=await channel.messages.fetch({limit:100,...(before?{before}:{})});
      if(!batch.size) break;
      count+=batch.size;check(count<=20000,'Conversation is too large for automatic archive. Export manually before closing.');
      for(const m of batch.values()) text+=`\n[${new Date(m.createdTimestamp).toISOString()}] ${m.author.id}\n${messageBody(m)}\n${m.embeds.map(e=>[e.title,e.description].filter(Boolean).join('\n')).join('\n')}\n`;
      check(Buffer.byteLength(text)<7_500_000,'Transcript exceeds the upload limit. Export manually before closing.');
      before=batch.last().id;if(batch.size<100) break;
    }
    check(Buffer.byteLength(text)<7_500_000,'Transcript exceeds the upload limit.');
    return new AttachmentBuilder(Buffer.from(text),{name:`modmail-${t.id}-staff-only.txt`});
  }
  async reply(i,t,text) {
    check(text.trim(),'Provide a message or attachment.');
    const prior=this.store.source(i.id);
    check(!prior,'This reply was already processed. Check the conversation record before retrying.');
    const event=this.store.event(t,i.id,'outgoing',i.user.id,text,'pending');
    try {
      const member=await this.client.users.fetch(t.owner);
      await sendText(member,`**Thai Airways Customer Care • Conversation #${t.id}**\n${text}`,i.id);
    } catch(e) {
      this.store.delivered(event,e.code===50007?'failed':'uncertain');
      throw new Error(e.code===50007?'Reply not delivered: the member has DMs disabled or has blocked the bot. Ask them to enable DMs.':'Reply delivery could not be confirmed; it may be partially delivered. Check the record before retrying.');
    }
    this.store.delivered(event,'delivered');
    try {await sendText(i.channel,`**Staff reply delivered • ${i.user.id}**\n${text}`);}
    catch {return this.respond(i,'✅ DM delivered, but the channel copy failed. The reply is saved in the transcript record.');}
    await this.respond(i,'✅ Reply delivered to the member by DM.');
  }
  async action(i,c) {
    const action=i.options.getSubcommand();
    if(action==='block' || action==='unblock') {
      check(canAdmin(i.member,c),'Only modmail administrators can block or unblock members.');
      const user=i.options.getUser('user',true);this.store.block(i.guildId,user.id,action==='block');
      return this.respond(i,`✅ Incoming modmail ${action==='block'?'blocked':'restored'} for <@${user.id}>. Existing conversations are retained.`);
    }
    const t=this.store.byChannel(i.channelId);
    check(t && t.guild===i.guildId,'Use this command in a modmail staff conversation.');
    check(canStaff(i.member,c,t),'You do not have permission to manage this conversation.');
    if(action==='transcript') return this.respond(i,{content:'Staff-only transcript, including internal notes. Attachment links may expire.',files:[await this.transcript(i.channel,t)]});
    if(action==='info') return this.respond(i,`**Modmail #${t.id}**\nMember: <@${t.owner}>\nStatus: ${t.status}\nAssigned: ${t.claimedBy?`<@${t.claimedBy}>`:'Unclaimed'}\nAccess: ${t.adminOnly?'Admins':'Support team'}`);
    check(t.status==='open','This conversation is closed. A new member DM will start a new conversation.');
    if(action==='reply') {
      const attachment=i.options.getAttachment('attachment');
      const text=[i.options.getString('message')?.trim(),attachment?`Attachment: ${attachment.url}`:null].filter(Boolean).join('\n\n');
      return this.reply(i,t,text);
    }
    if(action==='template') {
      const text=templates[i.options.getString('name',true)];check(text,'Unknown template.');return this.reply(i,t,text);
    }
    if(action==='note') {
      const note=i.options.getString('message',true);this.store.event(t,i.id,'internal note',i.user.id,note);
      await sendText(i.channel,`**Internal note • ${i.user.id} • not sent to member**\n${note}`);
      return this.respond(i,'✅ Internal note saved.');
    }
    if(action==='close') {
      const reason=i.options.getString('reason',true).trim();check(reason,'Provide a closure reason.');
      // Archive delivery is mandatory. No channel is automatically deleted.
      await this.log(i.guild,c,`Closed modmail #${t.id}`,`Member: <@${t.owner}>\nClosed by <@${i.user.id}>\nReason: ${reason}`,[await this.transcript(i.channel,t)]);
      t.status='closed';t.closeReason=reason;this.store.saveMail(t);this.store.event(t,i.id,'closed',i.user.id,reason);
      let notified=true;
      try {const user=await this.client.users.fetch(t.owner);await sendText(user,`✅ Your Customer Care conversation #${t.id} has been closed.\nReason: ${reason}\nSend a new DM if you need more help.`,i.id);}
      catch {notified=false;}
      await i.channel.send({embeds:[card('Conversation closed',`Reason: ${reason}\nArchived in private modmail logs. Member notification: ${notified?'delivered':'failed'}.`)],allowedMentions:silent}).catch(()=>{});
      return this.respond(i,`✅ Conversation archived and closed.${notified?'':' The closure DM could not be delivered.'}`);
    }
    let note;
    if(action==='claim') {check(!t.claimedBy || t.claimedBy===i.user.id,'Already claimed. An admin can unclaim it.');t.claimedBy=i.user.id;note=`Claimed by ${i.user.id}`;}
    else if(action==='unclaim') {check(!t.claimedBy || t.claimedBy===i.user.id || canAdmin(i.member,c),'Only the assigned staff member or an admin can unclaim.');t.claimedBy=null;note='Claim released';}
    else if(action==='escalate') {
      t.adminOnly=true;t.claimedBy=null;
      await i.channel.permissionOverwrites.set(this.permissions(i.guild,c,true));note='Restricted to modmail admins';
    } else throw new Error('Unknown modmail action.');
    this.store.saveMail(t);this.store.event(t,i.id,'action',i.user.id,note);
    await this.respond(i,`✅ ${note}`);
  }
  async handle(i) {
    if(!i.isChatInputCommand() && !i.isButton() && !i.isStringSelectMenu() && !i.isModalSubmit()) return;
    try {
      await i.deferReply({flags:MessageFlags.Ephemeral});
      if(!i.inGuild()) return this.respond(i,'Send a normal DM to this bot to contact Customer Care.');
      check(i.guildId===this.guildId,'This bot serves a different configured server.');
      await this.locks.run(this.guildId,async()=>{
        if(!i.isChatInputCommand()) return this.respond(i,'The ticket system has been replaced by modmail. Send a direct message to this bot for help.');
        if(i.commandName==='setup') return this.setup(i);
        if(i.commandName==='helpdesk') return this.respond(i,'**Thai Airways Modmail**\nMembers: open this bot’s profile and send a DM. Replies arrive through the bot.\nStaff: /modmail reply sends a DM; /modmail note and normal channel messages stay internal. Use claim, close, transcript, or escalate as needed.\nAdmins: /setup, /panel, /modmail block and unblock.');
        const c=this.store.config(i.guildId);check(c?.mailCategory && c?.mailLogs,'An administrator must run /setup to activate modmail first.');
        if(i.commandName==='panel') return this.panel(i,c);
        if(i.commandName==='modmail') return this.action(i,c);
        return this.respond(i,'Tickets have been replaced by modmail. Use /helpdesk for the new commands.');
      });
    } catch(e) {
      console.error('Modmail action failed:',e.code ?? e.name);
      const content=`❌ ${e.code?'Discord could not complete this action. Check bot permissions and try again.':e.message}`;
      try {if(i.deferred || i.replied) await i.editReply({content,allowedMentions:silent});else await i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:silent});} catch {}
    }
  }
  async reconcile(guild) {
    await guild.channels.fetch();
    for(const t of this.store.mails(guild.id)) {
      if(t.status==='creating') {
        const channel=guild.channels.cache.find(c=>c.topic?.startsWith(`THAI modmail #${t.id} | Member ${t.owner} |`));
        if(channel) {t.channel=channel.id;t.status='open';} else t.status='failed';
        this.store.saveMail(t);
      } else if(!guild.channels.cache.has(t.channel)) {t.status='missing';this.store.saveMail(t);}
    }
  }
}
