import { SlashCommandBuilder, PermissionFlagsBits as P } from 'discord.js';
import { templates } from './content.js';
const command=(name,description)=>new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false);
export const commands=[
  command('setup','Set up private modmail staff channels and roles').setDefaultMemberPermissions(P.Administrator),
  command('panel','Post or update the Customer Assistance DM panel').setDefaultMemberPermissions(P.ManageGuild)
    .addAttachmentOption(o=>o.setName('banner').setDescription('Optional PNG, JPEG, GIF or WebP banner; max 8 MB')),
  command('helpdesk','Explain how to contact staff through modmail'),
  command('modmail','Manage a private modmail conversation')
    .addSubcommand(s=>s.setName('reply').setDescription('Send an explicit reply to the member via bot DM')
      .addStringOption(o=>o.setName('message').setDescription('Message to send to the member').setMaxLength(3500))
      .addAttachmentOption(o=>o.setName('attachment').setDescription('Optional attachment (forwarded as a Discord link)')))
    .addSubcommand(s=>s.setName('template').setDescription('Send a prepared reply to the member')
      .addStringOption(o=>o.setName('name').setDescription('Prepared reply').setRequired(true).addChoices(...Object.keys(templates).map(v=>({name:v,value:v})))))
    .addSubcommand(s=>s.setName('note').setDescription('Record a staff-only note; never sent to the member')
      .addStringOption(o=>o.setName('message').setDescription('Internal note').setMaxLength(3500).setRequired(true)))
    .addSubcommand(s=>s.setName('claim').setDescription('Assign this conversation to yourself'))
    .addSubcommand(s=>s.setName('unclaim').setDescription('Release your claim'))
    .addSubcommand(s=>s.setName('escalate').setDescription('Restrict the conversation to admins'))
    .addSubcommand(s=>s.setName('close').setDescription('Archive and close; the next member DM starts a new conversation')
      .addStringOption(o=>o.setName('reason').setDescription('Closure reason shared with the member').setMaxLength(1000).setRequired(true)))
    .addSubcommand(s=>s.setName('transcript').setDescription('Download the staff-only conversation record'))
    .addSubcommand(s=>s.setName('info').setDescription('Show member, assignment, and status'))
    .addSubcommand(s=>s.setName('block').setDescription('Block incoming modmail from a member (admin)')
      .addUserOption(o=>o.setName('user').setDescription('Member to block').setRequired(true)))
    .addSubcommand(s=>s.setName('unblock').setDescription('Restore incoming modmail for a member (admin)')
      .addUserOption(o=>o.setName('user').setDescription('Member to unblock').setRequired(true)))
].map(c=>c.toJSON());
