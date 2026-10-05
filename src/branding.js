import { AttachmentBuilder, ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { fileURLToPath } from 'node:url';

export const bannerPath = fileURLToPath(new URL('../assets/thai-assistance-banner.jpeg',import.meta.url));

export function buildPanel(botId, banner={path:bannerPath,name:'thai-assistance-banner.jpeg'}) {
  const copy=`**Customer Assistance**

Our dedicated Customer Care team stands ready to assist passengers with all their questions, concerns, and inquiries. When you contact **@Thai Airways Customer Care**, you'll connect directly with a team of highly trained and dedicated representatives, equipped to assist you with any Thai Airways-related needs, flight inquiries, or service matters.

To contact us, **open a direct message with this bot and send your question**. Your message and attachments will be shared privately with our support team. Replies will arrive here in your DMs through the bot.

You can send a message at any time. Our team will respond when a staff member is available. Keep DMs enabled and never share passwords or tokens.

> -# ᴀ ꜱᴛᴀʀ ᴀʟʟɪᴀɴᴄᴇ ᴍᴇᴍʙᴇʀ`;
  return {
    flags:MessageFlags.IsComponentsV2,
    files:[new AttachmentBuilder(banner.path,{name:banner.name})],
    components:[
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${banner.name}`).setDescription('Thai Airways Customer Assistance')),
      new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(copy)),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Message Customer Care').setURL(`https://discord.com/users/${botId}`))
    ],
    allowedMentions:{parse:[]}
  };
}
