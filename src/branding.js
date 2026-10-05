import { AttachmentBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, TextDisplayBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { types } from './content.js';

export const bannerPath = fileURLToPath(new URL('../assets/thai-assistance-banner.jpeg',import.meta.url));

export function buildPanel(banner={path:bannerPath,name:'thai-assistance-banner.jpeg'}) {
  const copy=`**Customer Assistance**

Our dedicated Customer Care team stands ready to assist passengers with all their questions, concerns, and inquiries. When you contact **@Thai Airways Customer Care**, you'll connect directly with a team of highly trained and dedicated representatives, equipped to assist you with any Thai Airways-related needs, flight inquiries, or service matters.

Our Customer Care team is available **24 hours a day, 7 days a week**, ensuring assistance is always available whenever you need it.

> -# ᴀ ꜱᴛᴀʀ ᴀʟʟɪᴀɴᴄᴇ ᴍᴇᴍʙᴇʀ`;
  return {
    flags:MessageFlags.IsComponentsV2,
    files:[new AttachmentBuilder(banner.path,{name:banner.name})],
    components:[
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${banner.name}`).setDescription('Thai Airways Customer Assistance')),
      new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(copy)),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket:open').setPlaceholder('Select an assistance category').addOptions(Object.entries(types).map(([value,t])=>({label:t.label,value,description:t.description}))))
    ],
    allowedMentions:{parse:[]}
  };
}
