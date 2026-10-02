export const types = {
  general: { label:'General Support', emoji:'🎫', description:'Questions, account help, or server assistance', fields:['How can we help?', 'Explain the issue and steps already tried', 'Links or supporting information (optional)'] },
  report: { label:'Player Report', emoji:'🛡️', description:'Report a rule violation with evidence', fields:['Reported user name and Discord ID', 'What happened? Include date and time', 'Evidence links or witnesses (optional)'] },
  staff: { label:'Staff Report', emoji:'🔒', description:'Confidential report visible to ticket admins', adminOnly:true, fields:['Staff member name and Discord ID', 'Describe the incident with date and time', 'Evidence links (optional)'] },
  appeal: { label:'Moderation Appeal', emoji:'⚖️', description:'Request a review of a moderation action', fields:['Your user name and moderation action', 'Why should the action be reviewed?', 'Additional context or evidence (optional)'] },
  partnership: { label:'Partnership / Other', emoji:'🤝', description:'Partnership proposals and other requests', fields:['Community name or request subject', 'Tell us about your proposal or request', 'Relevant links (optional)'] }
};
export const templates = {
  welcome: 'Thank you for contacting THAI Support! A team member will assist you here. Please describe the issue clearly and include any relevant screenshots. Do not share passwords, tokens, or payment details.',
  evidence: 'To help us review this fairly, please provide the relevant user IDs, date and time (with timezone), and unedited screenshots or video links. You may upload evidence directly in this ticket.',
  waiting: 'We are waiting for some additional information from you. Please review our questions above and reply when you can so we can continue assisting you.',
  investigating: 'Thank you for your patience. Our team is reviewing your request and the information provided. We will update this ticket when we have more to share.',
  resolved: 'We believe your request has been resolved. Is there anything else we can help with before closing this ticket?',
  rules: 'Please keep this conversation respectful and relevant to your request. Repeated pings will not speed up a response. Our team will help as soon as someone is available.'
};
export function canAdmin(member, config) { return Boolean(member.permissions.has(8n) || (config?.adminRole && member.roles.cache.has(config.adminRole))); }
export function canStaff(member, config, ticket) { return canAdmin(member,config) || Boolean(!ticket?.adminOnly && config?.supportRole && member.roles.cache.has(config.supportRole)); }
export function mayAccess(member, config, ticket) { return member.id === ticket.owner || canStaff(member,config,ticket) || (!ticket.adminOnly && ticket.participants.includes(member.id)); }
export function transcriptLine(m) {
  const attachments = [...m.attachments.values()].map(a=>`Attachment: ${a.url}`).join('\n');
  const embeds = m.embeds.map(e=>[e.title,e.description,...(e.fields??[]).map(f=>`${f.name}: ${f.value}`)].filter(Boolean).join('\n')).join('\n');
  return `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag} (${m.author.id}) [${m.id}]\n${m.content || ''}${embeds ? '\n'+embeds : ''}${attachments ? '\n'+attachments : ''}\n`;
}
