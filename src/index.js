import 'dotenv/config';
import { createServer } from 'node:http';
import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { Store } from './store.js';
import { commands } from './commands.js';
import { Helpdesk } from './helpdesk.js';

const token=process.env.DISCORD_TOKEN;
if(!token) { console.error('Missing DISCORD_TOKEN. Set it securely in the Render environment.'); process.exit(1); }
const store=new Store(process.env.DATABASE_PATH || './data/helpdesk.sqlite');
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],allowedMentions:{parse:[]}});
const helpdesk=new Helpdesk(client,store);
let ready=false;
const server=createServer((req,res)=>{
  if(req.url!=='/' && req.url!=='/healthz') { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(ready && client.isReady()?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({service:'THAI Helpdesk',status:ready && client.isReady()?'online':'starting',uptime:Math.floor(process.uptime())}));
}).listen(Number(process.env.PORT)||10000,'0.0.0.0');
client.once(Events.ClientReady,async()=>{
  try {
    const rest=new REST({version:'10'}).setToken(token);
    const guild=process.env.DISCORD_GUILD_ID;
    await rest.put(guild ? Routes.applicationGuildCommands(client.user.id,guild) : Routes.applicationCommands(client.user.id),{body:commands});
    for(const g of client.guilds.cache.values()) await helpdesk.reconcile(g);
    ready=true; console.log(`THAI Helpdesk ready in ${client.guilds.cache.size} server(s).`);
  } catch(err) { console.error('Startup failed:',err.code ?? err.name); shutdown(1); }
});
client.on(Events.InteractionCreate,i=>helpdesk.handle(i));
client.on(Events.GuildCreate,g=>helpdesk.reconcile(g).catch(()=>console.error('Guild reconciliation failed.')));
client.on(Events.ChannelDelete,channel=>{
  const t=store.ticket(channel.id); if(t && t.status!=='deleted') { t.status='deleted'; store.save(t); }
});
client.on(Events.Error,err=>console.error('Discord connection error:',err.code ?? err.name));
function shutdown(code=0) { ready=false; client.destroy(); server.close(); store.close(); process.exitCode=code; }
process.once('SIGTERM',()=>shutdown()); process.once('SIGINT',()=>shutdown());
client.login(token).catch(err=>{console.error('Discord login failed:',err.code ?? err.name); shutdown(1);});
