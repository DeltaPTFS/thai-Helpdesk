# THAI Helpdesk

A Discord support bot with private intake forms, persistent ticket records, staff tools, and a Render health endpoint.

## Included

- `/setup` creates **Support**, **Ticket Admin**, a private **Tickets** category, and admin-only **ticket-logs**. Re-running repairs the configured resources without creating duplicates. Existing unrelated roles with matching names are not adopted.
- `/panel` posts a branded embed and category dropdown in the current text channel.
- Five intake formats: General Support, Player Report, confidential Staff Report, Moderation Appeal, Partnership / Other.
- Form answers, private welcome messages, and persistent Claim / Close / Reopen / Transcript buttons.
- Claims, priorities, participant access, rename, escalation, canned replies, ticket counts, and audit logs.
- Close with a reason; reopen without losing history. Closed tickets remain readable by their owner but the owner cannot send messages.
- Admin-only permanent deletion with confirmation and a mandatory successful transcript upload first.
- Two active tickets per member and a 60-second creation cooldown.
- SQLite persistence and recovery of interrupted ticket creation. Run exactly one instance with a persistent disk.

## Activate on your existing Render service

This repository contains code and configuration, not a Discord token. The bot cannot create server resources until it has been deployed, invited, and `/setup` is run.

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create/select your application. On **Bot**, enable **Message Content Intent** so transcripts include message text. Copy the bot token directly into Render's secret environment settings. **Never paste it into GitHub or chat.** Leave the Interactions Endpoint URL blank; this bot uses the Discord Gateway.
2. Under **OAuth2 → URL Generator**, select `bot` and `applications.commands`. Choose: View Channels, Send Messages, Read Message History, Embed Links, Attach Files, Manage Channels, Manage Roles, and Manage Messages. Invite the bot to your server. Place its role above the helpdesk roles in the server's role list. It does not need Administrator.
3. In your existing Render service for `thai-helpdesk.onrender.com`, connect `DeltaPTFS/thai-Helpdesk`, branch `main`. Set runtime **Node**, build command **`npm ci`**, start command **`npm start`**, and health check **`/healthz`**.
4. Configure environment variables:

   | Variable | Value |
   | --- | --- |
   | `DISCORD_TOKEN` | Your secret bot token |
   | `DISCORD_GUILD_ID` | Your server ID (recommended for immediate command registration) |
   | `NODE_VERSION` | `24.19.0` |
   | `DATABASE_PATH` | `/var/data/helpdesk.sqlite` |

5. Attach a persistent disk mounted at **`/var/data`** and use an always-on paid service with **one instance**. The included `render.yaml` describes a Starter service and 1 GB disk; applying it may incur Render charges. It does not automatically reconfigure an existing service. No hosting purchase is performed by this repository.
6. Deploy. Logs should show `THAI Helpdesk ready`. The public URL returns a minimal JSON status; it is not a ticket dashboard. Tickets and transcripts are not exposed on the web.
7. In Discord, run **`/setup`** as a server administrator. Assign the new **Support** role to your support team and **Ticket Admin** to trusted ticket managers. In **Server Settings → Integrations → THAI Helpdesk**, allow Ticket Admin to use `/panel` if its members do not have Manage Server. The bot also checks permissions at runtime.
8. Run **`/panel`** in a public channel such as `#support`. Open a test ticket as a regular member and verify the roles' visibility before launching.

Render Free services can sleep and lose local files on redeployment/restart; this SQLite configuration requires a persistent disk. See [Render Free limits](https://render.com/docs/free) and [persistent disks](https://render.com/docs/disks). Do not use uptime pings as a substitute for durable storage.

## Commands

| Command | Who can use it | Purpose |
| --- | --- | --- |
| `/setup` | Server administrators | Create/repair helpdesk resources |
| `/panel` | Ticket admins; Discord command permissions also apply | Post the opening panel |
| `/helpdesk` | Everyone | Show command guidance |
| `/ticket info` | Ticket participants/staff | Status, owner, assignment, priority |
| `/ticket close` | Owner/relevant staff | Close with a required reason |
| `/ticket transcript` | Owner/relevant staff | Private text export |
| `/ticket claim`, `unclaim` | Relevant staff | Manage assignment; admins may release claims |
| `/ticket reopen` | Relevant staff | Restore a closed ticket |
| `/ticket add`, `remove` | Relevant staff | Manage additional participants |
| `/ticket rename` | Relevant staff | Change the channel label |
| `/ticket priority` | Relevant staff | Low, normal, high, or urgent |
| `/ticket reply` | Relevant staff | Welcome, evidence, waiting, investigating, resolved, rules |
| `/ticket escalate` | Relevant staff | Restrict to owner/admins and remove extra participants |
| `/ticket delete` | Ticket admins | Confirm, archive, permanently delete a closed channel |
| `/ticket-stats` | Staff | Counts by state |

Ticket Admin is a helpdesk role, **not** the server-wide Administrator permission. Server administrators inherently bypass channel privacy. Staff Report tickets are visible to their owner and admins; ordinary Support staff cannot access them. Added participants are disabled for confidential tickets. Unassigning a role does not remove a separately granted participant override; use `/ticket remove` for participants.

## Customize formats and messages

Edit **`src/content.js`** to change category labels, intake questions, descriptions, and canned replies. Edit the `panel` method in **`src/helpdesk.js`** to change panel copy. No response-time promises are hardcoded. Submitted content cannot ping roles or `@everyone` through bot messages.

## Local development

Requires Node 24 or newer.

```sh
npm ci
cp .env.example .env
# Fill in .env privately.
npm test
npm start
```

`npm run check` validates entry point syntax. GitHub Actions runs syntax checks and automated tests. Tests cover authorization, private escalation, persistence, claim conflicts, close/reopen, transcript pagination, creation limits, restart recovery, and archive-before-delete behavior. Live Discord/Render verification still requires deployment credentials.

## Operations and limitations

- Keep the database and WAL files private. Back up the SQLite database using a SQLite-aware backup or stop the bot before copying all database files. Do not delete the disk during redeployments.
- Do not run multiple bot instances against this database. In-process locks serialize ticket mutations per guild.
- Close retains the channel; delete is irreversible after confirmation. Transcripts include currently available message content, form answers, audit entries, embed text, and attachment URLs. They cannot recover deleted messages or previous edits, and do not download attachment files. Attachment URLs may expire. Export limits are 20,000 messages / 7.5 MB; exceeding either blocks automatic deletion.
- Logs and archived transcripts are admin-only. Local audit data is retained if a routine log send fails; there is no automatic retry queue. Archive upload failure blocks deletion.
- Discord channel/category quotas still apply. Archive old tickets before reaching category limits.
- `/setup` repairs configured roles and channels. If a role was deleted and recreated, existing ticket overrides may reference the old role; close/reopen or escalate affected tickets to rebuild their permissions. Do not manually modify private channel overwrites.
- Changing between guild-specific and global command registration can leave old command copies; remove stale commands using the Discord developer tools. Startup registration replaces this application's commands in the chosen scope.
- Startup reconciles interrupted creations and channels manually deleted while offline. A ticket recovered after a crash may lack its welcome message; `/ticket` commands still work.
- This bot has no public ticket viewer or web control panel. `/` and `/healthz` expose status only.

## Live acceptance check

1. Run `/setup` twice and check there is one configured role pair, category, and log channel.
2. As a regular member open General Support; confirm a different regular member cannot see it.
3. As Support claim, send an evidence reply, add/remove a participant, and set priority.
4. Open Staff Report; confirm Support cannot see it while Ticket Admin can.
5. Close/reopen and verify owner message permissions. Restart the service and test an old button.
6. Close and delete as Ticket Admin; confirm the transcript exists in private logs before the channel disappears.
