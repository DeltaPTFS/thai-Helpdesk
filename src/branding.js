import { AttachmentBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, TextDisplayBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { types } from './content.js';

// Only the Thai server's supplied custom emojis are used in bot-authored content.
export const thaiEmojis = Object.freeze({
  support: { id:'1555047347573096489', name:'b_support', animated:false },
  alliance: { id:'1555049259609493555', name:'star_alliance', animated:false }
});
export const emojiText = e => e ? `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>` : ''; 
export const bannerPath = fileURLToPath(new URL('../assets/thai-assistance-banner.jpeg',import.meta.url));

export async function resolveThaiEmojis(guild, selected=thaiEmojis) {
  const available = await guild.emojis.fetch();
  const resolved = {};
  for (const [key,expected] of Object.entries(selected)) {
    if(expected===null || expected==='none') { resolved[key]=null; continue; }
    const input=typeof expected==='string' ? expected.trim() : expected.id;
    const id=input.match(/^<a?:\w+:(\d+)>$/)?.[1] ?? (/^\d+$/.test(input) ? input : null);
    const name=input.replace(/^:|:$/g,'');
    const matches=id ? [] : [...available.values()].filter(e=>e.name===name);
    const emoji=id ? available.get(id) : matches.length===1 ? matches[0] : null;
    if(!emoji || !emoji.available || !emoji.usable) {
      throw new Error(`The Thai emoji for ${key} (${typeof expected==='string' ? expected : expected.name}) is unavailable to this bot. Choose a custom emoji from this server, allow the bot in its emoji role restrictions, or enter none in the matching /panel emoji option.`);
    }
    resolved[key]={id:emoji.id,name:emoji.name,animated:Boolean(emoji.animated)};
  }
  return resolved;
}

export function buildPanel(emojis=thaiEmojis, banner={path:bannerPath,name:'thai-assistance-banner.jpeg'}) {
  const copy=`${emojiText(emojis.support)} **Customer Assistance**

Our dedicated Customer Care team stands ready to assist passengers with all their questions, concerns, and inquiries. When you contact **@Thai Airways Customer Care**, you'll connect directly with a team of highly trained and dedicated representatives, equipped to assist you with any Thai Airways-related needs, flight inquiries, or service matters.

Our Customer Care team is available **24 hours a day, 7 days a week**, ensuring assistance is always available whenever you need it.

> -# ᴀ ꜱᴛᴀʀ ᴀʟʟɪᴀɴᴄᴇ ᴍᴇᴍʙᴇʀ ${emojiText(emojis.alliance)}`;
  return {
    flags:MessageFlags.IsComponentsV2,
    files:[new AttachmentBuilder(banner.path,{name:banner.name})],
    components:[
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${banner.name}`).setDescription('Thai Airways Customer Assistance')),
      new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(copy)),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket:open').setPlaceholder('Select an assistance category').addOptions(Object.entries(types).map(([value,t])=>({label:t.label,value,description:t.description,...((emojis[value] === undefined ? emojis.support : emojis[value]) ? {emoji:emojis[value] === undefined ? emojis.support : emojis[value]} : {})}))))
    ],
    allowedMentions:{parse:[]}
  };
}
