export const templates = {
  welcome: 'Thank you for contacting THAI Support! A team member will assist you here. Please describe the issue clearly and include any relevant screenshots. Do not share passwords, tokens, or payment details.',
  evidence: 'To help us review this fairly, please provide the relevant user IDs, date and time (with timezone), and unedited screenshots or video links. You may send evidence directly in your DM.',
  waiting: 'We are waiting for some additional information from you. Please review our questions above and reply when you can so we can continue assisting you.',
  investigating: 'Thank you for your patience. Our team is reviewing your request and the information provided. We will update this conversation when we have more to share.',
  resolved: 'We believe your request has been resolved. Is there anything else we can help with before closing this conversation?',
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
