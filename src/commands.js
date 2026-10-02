import { SlashCommandBuilder, PermissionFlagsBits as P } from 'discord.js';
import { templates } from './content.js';
const command = (name, description) => new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false);
export const commands = [
  command('setup','Create or repair helpdesk roles, private category, and logs').setDefaultMemberPermissions(P.Administrator),
  command('panel','Post the ticket opening panel in this channel').setDefaultMemberPermissions(P.ManageGuild),
  command('helpdesk','Show helpdesk commands and ticket guidance'),
  command('ticket','Manage this support ticket')
    .addSubcommand(s=>s.setName('claim').setDescription('Assign this ticket to yourself'))
    .addSubcommand(s=>s.setName('unclaim').setDescription('Release your claim'))
    .addSubcommand(s=>s.setName('close').setDescription('Close this ticket with a reason'))
    .addSubcommand(s=>s.setName('reopen').setDescription('Reopen a closed ticket (staff)'))
    .addSubcommand(s=>s.setName('transcript').setDescription('Download the ticket transcript'))
    .addSubcommand(s=>s.setName('delete').setDescription('Archive and delete a closed ticket (admin)'))
    .addSubcommand(s=>s.setName('escalate').setDescription('Restrict this ticket to admins and its owner'))
    .addSubcommand(s=>s.setName('add').setDescription('Add a participant (staff)').addUserOption(o=>o.setName('user').setDescription('Member to add').setRequired(true)))
    .addSubcommand(s=>s.setName('remove').setDescription('Remove a participant (staff)').addUserOption(o=>o.setName('user').setDescription('Member to remove').setRequired(true)))
    .addSubcommand(s=>s.setName('rename').setDescription('Rename this ticket (staff)').addStringOption(o=>o.setName('name').setDescription('New channel label').setMaxLength(60).setRequired(true)))
    .addSubcommand(s=>s.setName('priority').setDescription('Set the ticket priority (staff)').addStringOption(o=>o.setName('level').setDescription('Priority').setRequired(true).addChoices(...['low','normal','high','urgent'].map(v=>({name:v,value:v})))))
    .addSubcommand(s=>s.setName('reply').setDescription('Send a prepared support message (staff)').addStringOption(o=>o.setName('template').setDescription('Prepared message').setRequired(true).addChoices(...Object.keys(templates).map(v=>({name:v,value:v})))))
    .addSubcommand(s=>s.setName('info').setDescription('Show status, priority, and assignment')),
  command('ticket-stats','Show helpdesk ticket counts (staff)')
].map(c=>c.toJSON());
