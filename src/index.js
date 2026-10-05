import 'dotenv/config';
import { createServer } from 'node:http';
import { Client, GatewayIntentBits, Events, REST, Routes, Partials } from 'discord.js';
import { MailStore } from './mail-store.js';
import { commands } from './commands.js';
import { Modmail } from './modmail.js';

const token=process.env.DISCORD_TOKEN;
if(!token) { console.error('Missing DISCORD_TOKEN. Set it securely in the Render environment.'); process.exit(1); }
const store=new MailStore(process.env.DATABASE_PATH || './data/helpdesk.sqlite');
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,GatewayIntentBits.DirectMessages],partials:[Partials.Channel],allowedMentions:{parse:[]}});
let helpdesk;
let ready=false;
const server=createServer((req,res)=>{
  if(req.url!=='/' && req.url!=='/healthz') { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(ready && client.isReady()?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({service:'THAI Modmail',status:ready && client.isReady()?'online':'starting',uptime:Math.floor(process.uptime())}));
}).listen(Number(process.env.PORT)||10000,'0.0.0.0');
client.once(Events.ClientReady,async()=>{
  try {
    const rest=new REST({version:'10'}).setToken(token);
    const guildId=process.env.DISCORD_GUILD_ID || (client.guilds.cache.size===1 ? client.guilds.cache.first().id : null);
    if(!guildId || !client.guilds.cache.has(guildId)) throw new Error('Set DISCORD_GUILD_ID to the server this bot serves.');
    helpdesk=new Modmail(client,store,guildId);
    await helpdesk.reconcile(client.guilds.cache.get(guildId));
    await rest.put(Routes.applicationGuildCommands(client.user.id,guildId),{body:commands});
    // Retire the previous global ticket commands; modmail commands live in the target guild.
    await rest.put(Routes.applicationCommands(client.user.id),{body:[]});
    ready=true; helpdesk.startMaintenance(); console.log(`THAI Modmail ready in ${client.guilds.cache.size} server(s).`);
  } catch(err) { console.error('Startup failed:',err.code ?? err.message); shutdown(1); }
});
client.on(Events.InteractionCreate,i=>{
  if(ready) void helpdesk.handle(i);
});
client.on(Events.MessageCreate,m=>{
  if(ready) void helpdesk.onMessage(m).catch(e=>console.error('Modmail listener failed:',e.code ?? e.name));
});
client.on(Events.ChannelDelete,channel=>{
  const t=store.byChannel(channel.id);if(t && t.status==='open') {t.status='missing';store.saveMail(t);}
});
client.on(Events.Error,err=>console.error('Discord connection error:',err.code ?? err.name));
function shutdown(code=0) { ready=false; helpdesk?.stopMaintenance(); client.destroy(); server.close(); store.close(); process.exitCode=code; }
process.once('SIGTERM',()=>shutdown()); process.once('SIGINT',()=>shutdown());
client.login(token).catch(err=>{console.error('Discord login failed:',err.code ?? err.message); shutdown(1);});
