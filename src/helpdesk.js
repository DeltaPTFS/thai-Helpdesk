import { ActionRowBuilder as Row, ButtonBuilder as Button, ButtonStyle as Style, StringSelectMenuBuilder as Select, ModalBuilder as Modal, TextInputBuilder as Input, TextInputStyle, EmbedBuilder as Embed, ChannelType, PermissionFlagsBits as P, AttachmentBuilder, MessageFlags } from 'discord.js';
import { types, templates, canAdmin, canStaff, mayAccess, transcriptLine } from './content.js';
import { Locks } from './store.js';

const COLOR = 0x653cba;
const allow = [P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.AttachFiles,P.EmbedLinks];
const silent = { parse:[] };
const embed = (title, description) => new Embed().setColor(COLOR).setTitle(title).setDescription(description).setFooter({text:'THAI • Helpdesk'}).setTimestamp();
const fail = message => { throw new Error(message); };
const requireThat = (condition,message) => { if(!condition) fail(message); };
const controls = () => new Row().addComponents(
  new Button().setCustomId('ticket:claim').setLabel('Claim').setStyle(Style.Primary),
  new Button().setCustomId('ticket:close').setLabel('Close').setStyle(Style.Danger),
  new Button().setCustomId('ticket:reopen').setLabel('Reopen').setStyle(Style.Success),
  new Button().setCustomId('ticket:transcript').setLabel('Transcript').setStyle(Style.Secondary)
);

export class Helpdesk {
  locks = new Locks();
  constructor(client,store) { this.client=client; this.store=store; }
  async respond(i,content) { return i.editReply(typeof content==='string' ? {content,allowedMentions:silent} : content); }
  async log(guild,config,title,description,files=[]) {
    const channel = await guild.channels.fetch(config.logChannel);
    requireThat(channel?.isTextBased(),'Ticket log channel is missing. Ask an administrator to run /setup.');
    return channel.send({embeds:[embed(title,description)],files,allowedMentions:silent});
  }
  async audit(i,t,action) {
    this.store.audit(t,i.user.id,action);
    try { await this.log(i.guild,this.store.config(i.guildId),`Ticket #${t.id}`,`${action}\nBy <@${i.user.id}> • <#${t.channel}>`); }
    catch { console.error('Ticket log delivery failed; local audit preserved.',t.id); }
  }
  overwrites(guild,c,t) {
    const entries = [
      {id:guild.id,deny:[P.ViewChannel]},
      {id:this.client.user.id,allow:[...allow,P.ManageChannels,P.ManageMessages]},
      {id:c.adminRole,allow},
      {id:c.supportRole,...(t.adminOnly ? {deny:[P.ViewChannel]} : {allow})}
    ];
    for(const id of new Set([t.owner,...t.participants])) entries.push({id,allow:t.status==='closed' ? [P.ViewChannel,P.ReadMessageHistory] : allow,deny:t.status==='closed' ? [P.SendMessages] : []});
    return entries;
  }
  async setup(i) {
    requireThat(i.member.permissions.has(P.Administrator),'Only a server administrator can run /setup.');
    const me = await i.guild.members.fetchMe();
    requireThat(me.permissions.has([P.ManageChannels,P.ManageRoles,P.ViewChannel,P.SendMessages,P.EmbedLinks,P.AttachFiles,P.ReadMessageHistory]),'Give the bot Manage Channels, Manage Roles, View Channels, Send Messages, Embed Links, Attach Files, and Read Message History first.');
    await i.guild.roles.fetch(); await i.guild.channels.fetch();
    const c = this.store.config(i.guildId) ?? {};
    for(const [key,name,color] of [['supportRole','Support',0x3498db],['adminRole','Ticket Admin',COLOR]]) {
      let role = c[key] && i.guild.roles.cache.get(c[key]);
      // Do not silently adopt existing roles with the same name and unknown membership.
      if(!role) role = await i.guild.roles.create({name,color,permissions:[],reason:'THAI helpdesk setup'});
      c[key]=role.id;
      this.store.saveConfig(i.guildId,c);
    }
    const privatePermissions = [
      {id:i.guildId,deny:[P.ViewChannel]},
      {id:this.client.user.id,allow:[...allow,P.ManageChannels,P.ManageMessages]},
      {id:c.adminRole,allow}
    ];
    let category = c.category && i.guild.channels.cache.get(c.category);
    if(!category || category.type!==ChannelType.GuildCategory) category=await i.guild.channels.create({name:'Tickets',type:ChannelType.GuildCategory,permissionOverwrites:privatePermissions});
    else await category.permissionOverwrites.set(privatePermissions);
    c.category=category.id; this.store.saveConfig(i.guildId,c);
    let logs = c.logChannel && i.guild.channels.cache.get(c.logChannel);
    if(!logs || logs.type!==ChannelType.GuildText) logs=await i.guild.channels.create({name:'ticket-logs',type:ChannelType.GuildText,parent:category.id,permissionOverwrites:privatePermissions});
    else await logs.permissionOverwrites.set(privatePermissions);
    c.logChannel=logs.id; this.store.saveConfig(i.guildId,c);
    await this.respond(i,`Helpdesk ready!\nSupport: <@&${c.supportRole}>\nTicket Admin: <@&${c.adminRole}>\nCategory: **Tickets**\nPrivate logs: <#${c.logChannel}>\n\nAssign the roles to trusted staff, then run **/panel** in your public support channel. Neither role grants server-wide Administrator permissions. In Server Settings → Integrations, allow Ticket Admin to use /panel if needed.`);
  }
  async panel(i,c) {
    requireThat(canAdmin(i.member,c),'Only a ticket administrator can post the panel.');
    requireThat(i.channel.type===ChannelType.GuildText,'Post the panel in a regular server text channel.');
    await i.channel.send({embeds:[embed('THAI | Support Center','Welcome to the THAI Helpdesk. Select the category that best matches your request and complete the short form.\n\n🎫 **General Support** — Questions and assistance\n🛡️ **Player Report** — Report a rule violation\n🔒 **Staff Report** — Confidential admin review\n⚖️ **Moderation Appeal** — Request a review\n🤝 **Partnership / Other** — Proposals and other requests\n\n**Your ticket is private.** Relevant staff and server administrators can access it. Please provide clear details and evidence, and avoid opening duplicate tickets. Never share passwords or tokens.\n\nOur team will respond when available.')],components:[new Row().addComponents(new Select().setCustomId('ticket:open').setPlaceholder('Choose a support category…').addOptions(Object.entries(types).map(([value,t])=>({label:t.label,value,emoji:t.emoji,description:t.description}))))],allowedMentions:silent});
    await this.respond(i,'Ticket panel posted.');
  }
  async open(i,kind,c) {
    requireThat(types[kind],'Unknown ticket category.');
    requireThat(this.store.owned(i.guildId,i.user.id).length<2,'You already have two active tickets. Please use or close an existing ticket first.');
    const last=this.store.latest(i.guildId,i.user.id);
    requireThat(!last || Date.now()-last.created>=60000,'Please wait one minute between creating tickets.');
    const answers=types[kind].fields.map((label,n)=>({label,value:i.fields.getTextInputValue(`field${n}`).trim() || 'Not provided'}));
    let t=this.store.create(i.guildId,i.user.id,{kind,answers,adminOnly:Boolean(types[kind].adminOnly),participants:[],priority:'normal',claimedBy:null});
    let channel;
    try {
      channel=await i.guild.channels.create({name:`ticket-${String(t.id).padStart(4,'0')}-${kind}`,type:ChannelType.GuildText,parent:c.category,topic:`THAI ticket #${t.id} | Owner ${t.owner} | ${kind}`,permissionOverwrites:this.overwrites(i.guild,c,t),reason:`Helpdesk ticket #${t.id}`});
      t.channel=channel.id; t.status='open'; this.store.save(t);
      await channel.send({content:`<@${t.owner}>`,embeds:[embed(`${types[kind].emoji} Ticket #${t.id} • ${types[kind].label}`,`${templates.welcome}\n\n**Status:** Open • **Priority:** Normal\n**Visibility:** ${t.adminOnly?'Owner and ticket admins':'Owner and support team'}\nUse the buttons below or **/ticket** to manage this request.`).addFields(answers.map(a=>({name:a.label,value:a.value})))],components:[controls()],allowedMentions:{users:[t.owner],parse:[]}});
    } catch(err) {
      if(channel) {
        // Keep a tracked channel if only the welcome message failed.
        t.channel=channel.id; t.status='open'; this.store.save(t);
        await this.respond(i,`Ticket created: <#${channel.id}>. The welcome message failed; staff can use /ticket commands.`);
        return;
      }
      t.status='failed'; this.store.save(t); throw err;
    }
    await this.audit(i,t,`Opened ${types[kind].label}`);
    await this.respond(i,`Your private ticket is ready: <#${channel.id}>`);
  }
  async transcript(channel,t) {
    const messages=[]; let before;
    // Bound export size; refuse incomplete archives instead of silently deleting history.
    while(true) {
      const batch=await channel.messages.fetch({limit:100,...(before?{before}:{})});
      if(!batch.size) break;
      messages.push(...batch.values()); before=batch.last().id;
      requireThat(messages.length<=20000,'This ticket is too large for automatic export. Archive it manually; deletion has been blocked.');
      if(batch.size<100) break;
    }
    messages.sort((a,b)=>a.createdTimestamp-b.createdTimestamp || (BigInt(a.id)<BigInt(b.id)?-1:1));
    const audit=this.store.history(t).map(a=>`${new Date(a.created).toISOString()} ${a.actor}: ${a.action}`).join('\n');
    const header=`THAI HELPDESK — Ticket #${t.id}\nOwner: ${t.owner}\nType: ${t.kind}\nStatus: ${t.status}\nExported: ${new Date().toISOString()}\n\nSubmitted form\n${t.answers.map(a=>`${a.label}: ${a.value}`).join('\n')}\n\nAudit\n${audit}\n\nMessages (currently retained in Discord; edited/deleted history is not recoverable)\n\n`;
    const buffer=Buffer.from(header+messages.map(transcriptLine).join('\n'));
    requireThat(buffer.length<7_500_000,'Transcript exceeds the safe upload limit. Archive manually; deletion has been blocked.');
    return new AttachmentBuilder(buffer,{name:`ticket-${t.id}.txt`});
  }
  async action(i,action,c) {
    const t=this.store.ticket(i.channelId);
    requireThat(t && t.guild===i.guildId,'This channel is not a tracked ticket.');
    const staff=canStaff(i.member,c,t), admin=canAdmin(i.member,c);
    requireThat(mayAccess(i.member,c,t),'You do not have permission to access this ticket.');
    if(action==='info') return this.respond(i,{embeds:[embed(`Ticket #${t.id}`,`**Status:** ${t.status}\n**Priority:** ${t.priority}\n**Assigned:** ${t.claimedBy?`<@${t.claimedBy}>`:'Unclaimed'}\n**Owner:** <@${t.owner}>\n**Category:** ${types[t.kind].label}\n**Access:** ${t.adminOnly?'Admin only':'Support team'}`)]});
    if(action==='transcript') {
      requireThat(staff || i.user.id===t.owner,'Only staff or the ticket owner can export transcripts.');
      return this.respond(i,{files:[await this.transcript(i.channel,t)],content:'Private transcript. Attachment links may expire; attachments are not downloaded.'});
    }
    if(action==='close') {
      requireThat(staff || i.user.id===t.owner,'Only staff or the ticket owner can close this ticket.');
      requireThat(t.status==='open','This ticket is already closed.');
      const reason=i.fields.getTextInputValue('reason').trim();
      requireThat(reason.length>0,'Please enter a close reason.');
      const closed={...t,status:'closed',closeReason:reason,closedBy:i.user.id,closedAt:Date.now()};
      await i.channel.permissionOverwrites.set(this.overwrites(i.guild,c,closed));
      this.store.save(closed);
      await this.audit(i,closed,`Closed: ${reason}`);
      await i.channel.send({embeds:[embed('Ticket closed',`**Reason:** ${reason}\nClosed by <@${i.user.id}>. Staff can reopen with /ticket reopen. This channel is retained until an administrator archives and deletes it.`)],allowedMentions:silent});
      return this.respond(i,'Ticket closed.');
    }
    requireThat(staff,'This action requires the relevant Support or Ticket Admin role.');
    if(action==='delete' || action==='confirm-delete') {
      requireThat(admin,'Only ticket administrators can delete tickets.');
      requireThat(t.status==='closed','Close this ticket before deleting it.');
      if(action==='delete') return this.respond(i,{content:'Permanently delete this closed channel? A transcript must be successfully uploaded to the private ticket logs first. Uploaded attachments themselves are not backed up.',components:[new Row().addComponents(new Button().setCustomId(`ticket:confirm-delete:${i.user.id}`).setLabel('Archive & permanently delete').setStyle(Style.Danger))]});
      requireThat(i.customId.split(':')[2]===i.user.id,'Only the administrator who requested deletion can confirm it.');
      const file=await this.transcript(i.channel,t);
      await this.log(i.guild,c,`Archive • Ticket #${t.id}`,`Owner: <@${t.owner}>\nDeleted by <@${i.user.id}>\nReason: ${t.closeReason}`, [file]);
      await this.respond(i,'Transcript archived. Deleting this channel.');
      await i.channel.delete(`Archived ticket #${t.id}`);
      t.status='deleted'; this.store.save(t); this.store.audit(t,i.user.id,'Archived and deleted'); return;
    }
    if(action==='reopen') {
      requireThat(t.status==='closed','This ticket is already open.');
      requireThat(this.store.owned(i.guildId,t.owner).length<2,'The owner already has two active tickets.');
      const reopened={...t,status:'open'};
      await i.channel.permissionOverwrites.set(this.overwrites(i.guild,c,reopened));
      this.store.save(reopened); await this.audit(i,reopened,'Reopened');
      await i.channel.send({embeds:[embed('Ticket reopened',`Reopened by <@${i.user.id}>. You can reply here again.`)],allowedMentions:silent});
      return this.respond(i,'Ticket reopened.');
    }
    requireThat(t.status==='open','Reopen this ticket before making changes.');
    let note;
    if(action==='claim') {
      requireThat(!t.claimedBy || t.claimedBy===i.user.id,'This ticket is already claimed. An administrator can unclaim it.');
      t.claimedBy=i.user.id; note=`Claimed by <@${i.user.id}>`;
    } else if(action==='unclaim') {
      requireThat(!t.claimedBy || t.claimedBy===i.user.id || admin,'Only the assigned staff member or an admin can unclaim this ticket.');
      t.claimedBy=null; note='Ticket returned to the support queue';
    } else if(action==='escalate') {
      requireThat(!t.adminOnly,'This ticket is already restricted to admins.');
      t.adminOnly=true; t.participants=[]; t.claimedBy=null;
      await i.channel.permissionOverwrites.set(this.overwrites(i.guild,c,t)); note='Escalated to ticket admins; additional participants removed';
    } else if(action==='add' || action==='remove') {
      requireThat(!t.adminOnly,'Additional participants are disabled for confidential tickets.');
      const user=i.options.getUser('user',true);
      requireThat(user.id!==t.owner && user.id!==this.client.user.id,'You cannot change access for the owner or bot.');
      const member=await i.guild.members.fetch(user.id);
      requireThat(!canStaff(member,c,t),'Manage staff access through server roles.');
      if(action==='add') {
        requireThat(t.participants.length<20,'This ticket already has 20 additional participants.');
        t.participants=[...new Set([...t.participants,user.id])];
      } else t.participants=t.participants.filter(id=>id!==user.id);
      await i.channel.permissionOverwrites.set(this.overwrites(i.guild,c,t)); note=`Participant ${action==='add'?'added':'removed'}: <@${user.id}>`;
    } else if(action==='rename') {
      const name=i.options.getString('name',true).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
      requireThat(name,'Use letters or numbers in the channel name.');
      await i.channel.setName(`ticket-${t.id}-${name}`); note=`Renamed to ticket-${t.id}-${name}`;
    } else if(action==='priority') {
      t.priority=i.options.getString('level',true); note=`Priority set to ${t.priority}`;
    } else if(action==='reply') {
      const key=i.options.getString('template',true);
      requireThat(templates[key],'Unknown template.');
      await i.channel.send({embeds:[embed('THAI Support',templates[key])],allowedMentions:silent});
      await this.audit(i,t,`Sent template: ${key}`); return this.respond(i,'Support reply sent.');
    } else fail('Unknown ticket action.');
    this.store.save(t); await this.audit(i,t,note);
    await i.channel.send({embeds:[embed(`Ticket #${t.id} updated`,note)],allowedMentions:silent});
    return this.respond(i,note);
  }
  async handle(i) {
    if(!i.isChatInputCommand() && !i.isButton() && !i.isStringSelectMenu() && !i.isModalSubmit()) return;
    if(!i.inGuild()) return i.reply({content:'Use this bot in a server.',flags:MessageFlags.Ephemeral});
    try {
      // Show modals as the initial response; Discord does not permit deferring first.
      if(i.isStringSelectMenu() && i.customId==='ticket:open') {
        const kind=i.values[0], type=types[kind];
        requireThat(type && this.store.config(i.guildId)?.logChannel,'An administrator must run /setup first.');
        const modal=new Modal().setCustomId(`ticket:create:${kind}`).setTitle(type.label);
        modal.addComponents(type.fields.map((label,n)=>new Row().addComponents(new Input().setCustomId(`field${n}`).setLabel(label.slice(0,45)).setStyle(n===0?TextInputStyle.Short:TextInputStyle.Paragraph).setMaxLength(n===0?150:1000).setRequired(n<2))));
        return await i.showModal(modal);
      }
      if((i.isButton() && i.customId==='ticket:close') || (i.isChatInputCommand() && i.commandName==='ticket' && i.options.getSubcommand()==='close')) {
        const t=this.store.ticket(i.channelId), c=this.store.config(i.guildId);
        requireThat(t && (t.owner===i.user.id || canStaff(i.member,c,t)),'Only the ticket owner or relevant staff can close this ticket.');
        requireThat(t.status==='open','This ticket is already closed.');
        return await i.showModal(new Modal().setCustomId('ticket:close-submit').setTitle('Close ticket').addComponents(new Row().addComponents(new Input().setCustomId('reason').setLabel('Resolution or reason for closing').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
      }
      await i.deferReply({flags:MessageFlags.Ephemeral});
      await this.locks.run(i.guildId,async()=>{
        const c=this.store.config(i.guildId);
        if(i.isChatInputCommand() && i.commandName==='setup') return this.setup(i);
        if(i.isChatInputCommand() && i.commandName==='helpdesk') return this.respond(i,'**THAI Helpdesk**\nOpen a ticket using the support panel. Complete the form and add evidence in your private channel.\n\n**Members:** /ticket info, close, transcript\n**Support:** claim, unclaim, reopen, add, remove, rename, priority, reply, escalate; /ticket-stats\n**Admins:** /setup, /panel, /ticket delete\n\nStaff reports are restricted to the owner and admins. Server administrators can always access channels. Never share passwords or tokens.');
        requireThat(c?.logChannel,'An administrator must run /setup first.');
        if(i.isChatInputCommand()) {
          if(i.commandName==='panel') return this.panel(i,c);
          if(i.commandName==='ticket') return this.action(i,i.options.getSubcommand(),c);
          if(i.commandName==='ticket-stats') {
            requireThat(canStaff(i.member,c,null),'Only support staff can view ticket counts.');
            return this.respond(i,{embeds:[embed('Helpdesk overview',this.store.stats(i.guildId).map(r=>`**${r.status}:** ${r.count}`).join('\n') || 'No tickets yet.')]});
          }
        }
        if(i.isModalSubmit() && i.customId.startsWith('ticket:create:')) return this.open(i,i.customId.split(':')[2],c);
        if(i.isModalSubmit() && i.customId==='ticket:close-submit') return this.action(i,'close',c);
        if(i.isButton() && i.customId.startsWith('ticket:')) return this.action(i,i.customId.split(':')[1],c);
        return this.respond(i,'Unknown helpdesk command.');
      });
    } catch(err) {
      // Do not log interaction objects or request bodies: they can contain tokens.
      console.error('Helpdesk operation failed:',err.code ?? err.name);
      const content=err.code ? 'Discord could not complete that action. Check the bot permissions and role position, then try again. Your channel has not been intentionally removed unless deletion was confirmed.' : err.message;
      try { if(i.deferred || i.replied) await i.editReply({content,components:[],allowedMentions:silent}); else await i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:silent}); }
      catch { console.error('Unable to send interaction error response.'); }
    }
  }
  async reconcile(guild) {
    // Recover channels created immediately before a process restart; never delete history.
    await guild.channels.fetch();
    for(const t of this.store.all(guild.id)) {
      if(t.status==='creating') {
        const channel=guild.channels.cache.find(c=>c.topic?.startsWith(`THAI ticket #${t.id} | Owner ${t.owner} |`));
        if(channel) { t.channel=channel.id; t.status='open'; } else t.status='failed';
        this.store.save(t);
      } else if(!guild.channels.cache.has(t.channel)) { t.status='deleted'; this.store.save(t); }
    }
  }
}
