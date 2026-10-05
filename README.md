# Thai Airways Modmail

Members send a **direct message to the bot**. The bot forwards it to a private staff channel. Staff use **`/modmail reply`** to send a DM back through the bot. Members do not need to open a ticket channel or complete a form.

Normal staff-channel messages and `/modmail note` are internal: they are never automatically forwarded to members. Replies appear under the bot's identity, not a staff member's personal account.

## Activate on Render

- Repository: `DeltaPTFS/thai-Helpdesk`, branch `main`.
- Build: `npm ci`
- Start: `npm start`
- Node: `24.19.0`
- Health check: `/healthz`
- One instance with a persistent disk mounted at `/var/data`.

Environment:

| Key | Value |
| --- | --- |
| `DISCORD_TOKEN` | Secret bot token, set privately in Render |
| `DISCORD_GUILD_ID` | ID of the Thai server the bot serves |
| `DATABASE_PATH` | `/var/data/helpdesk.sqlite` |
| `NODE_VERSION` | `24.19.0` |

`DISCORD_GUILD_ID` is strongly recommended. If omitted, startup only selects a server automatically when the bot belongs to exactly one server. It never routes a DM arbitrarily between multiple servers.

In the [Discord Developer Portal](https://discord.com/developers/applications), enable **Message Content Intent**. The bot subscribes to Direct Messages and uses channel partials for DM reception. Leave Interactions Endpoint URL blank (Gateway mode).

Invite scopes: `bot`, `applications.commands`. Give the bot View Channels, Send Messages, Read Message History, Embed Links, Attach Files, Manage Channels, Manage Roles, and Manage Messages. Place its role above the staff roles it manages. Administrator permission is not required for the bot.

Deploy, then run **`/setup`** as a server administrator and **`/panel`** in the public assistance channel. Setup creates a private **Modmail** category and admin-only **modmail-logs**. It reuses the previously configured Support and Ticket Admin roles when present; a new installation creates Support and Modmail Admin. Assign staff roles to trusted people. To let an admin-role member without Manage Server post the panel, allow `/panel` in Server Settings → Integrations.

The included Render blueprint uses a paid Starter service and persistent disk. Render Free does not retain a local database across restarts/redeployments. See [Render persistent disks](https://render.com/docs/disks). The public web URL is a minimal health endpoint, not a dashboard.

## Member experience

1. Open the bot profile from **Message Customer Care** on the assistance panel.
2. Choose **Message** and send a question or an attachment.
3. The bot confirms that it forwarded the message to the support team. If no confirmation arrives, retry when the bot is online.
4. Staff replies arrive as DMs from the bot. Keep DMs enabled and do not block the bot.
5. When staff close the conversation, the member receives the reason when DM delivery is possible. A later DM starts a new conversation.

The private staff channel is visible to Support and modmail admins, including server administrators. The member is not added to the staff channel. This is a shared support inbox, not a confidential one-to-one conversation with an individual moderator. Members who also hold a staff role retain the access granted by that role.

Only members of the configured server can send modmail. Nonmembers and blocked users are not forwarded. Each member can have one active conversation. A rate limit permits ten DM events per minute per member; rejected messages are not queued.

## Staff commands

| Command | Behavior |
| --- | --- |
| `/setup` | Create/repair resources; server administrators only |
| `/panel [banner]` | Post/update the public DM contact panel; modmail admins |
| `/helpdesk` | Explain how to use modmail |
| `/modmail reply message:… [attachment]` | Explicitly send a DM to the member |
| `/modmail template name:…` | Send a prepared support reply |
| `/modmail note message:…` | Record an internal note; no member DM |
| `/modmail claim` | Assign the conversation to yourself |
| `/modmail unclaim` | Release your claim; admins may release another person's claim |
| `/modmail escalate` | Restrict the staff channel to admins |
| `/modmail close reason:…` | Upload transcript to private logs, close, notify member |
| `/modmail transcript` | Export a staff-only record including notes |
| `/modmail info` | Show member, assignment, visibility and status |
| `/modmail block user:…` | Admin: stop inbound modmail from a member |
| `/modmail unblock user:…` | Admin: allow inbound modmail again |

Only relevant staff can manage a conversation. Support cannot manage an escalated conversation. Claims indicate assignment but do not prevent other authorized staff from replying. Block/unblock affects incoming DMs only and does not remove existing conversations.

Closing requires successful transcript upload. If upload fails, the conversation stays open. Closed channels remain for staff review and are not automatically deleted. Admins can manually remove archived channels after confirming the transcript exists, to stay within Discord category/channel quotas.

## Panel and branding

The panel retains your Thai banner, Customer Assistance card, and Star Alliance footer, with a **Message Customer Care** link button instead of a ticket dropdown. It explains that messages are forwarded privately to the team and replies arrive via DM. It does not promise immediate 24/7 human staffing.

`/panel banner:` accepts PNG/JPEG/GIF/WebP up to 8 MB. Uploaded images are stored beside the database and re-uploaded when the panel is edited. Keep both on the persistent disk. Subsequent `/panel` calls update the tracked message in that channel. Older untracked panels should be manually removed.

No custom emojis are required. Only ✅ and ❌ are used in appropriate bot status messages. User-supplied content is retained as submitted, with mentions disabled on forwarded messages.

## Migration from tickets

Deploy this version and run `/setup`, then `/panel`. Startup replaces this app's commands in the configured server and removes its old global commands. `/ticket` and `/ticket-stats` are retired. Old ticket buttons respond with instructions to DM the bot instead.

Existing ticket channels, old ticket rows, old log channels and role assignments are not deleted. Old ticket channels are not converted into modmail conversations because their messages were server conversations, not DMs. Their existing access remains unchanged. Manually archive/remove old channels when you no longer need them. Modmail uses separate database tables and a new private category.

## Delivery and record limitations

- Attachments are forwarded **as Discord links**, in either direction. Files are not downloaded or permanently backed up. Links can expire; ask the member to resend when needed.
- Only new message events received while the bot is connected are relayed. There is no offline inbox replay, message-edit synchronization, message-deletion synchronization, voice call handling, or automatic retry queue.
- Stickers prompt staff to ask for a text description. Reactions and other non-message activity are not relayed.
- Incoming gateway message IDs are deduplicated in SQLite. Outgoing replies record pending, delivered, failed, or uncertain status, and use stable Discord nonces. A connection failure can leave partial delivery; review the record before retrying. Do not run multiple bot instances.
- A disabled/blocked DM is reported to staff as a delivery failure, never as successful delivery. Closing can still complete if its final notification DM fails; staff are told.
- Transcripts are **staff-only** and contain internal notes, delivery records and retained channel messages. Do not send them to members. Deleted channel messages and old edits cannot be reconstructed. Channel messages are listed newest-first after the chronological delivery ledger.
- Automatic exports are limited to 20,000 retained channel messages and 7.5 MB. Oversized exports block automatic close; archive manually and manage the channel outside the bot.
- Database and banner files are private application data. Use SQLite-aware backups or stop the bot before copying database/WAL files. Closing does not erase stored messages.
- Health endpoints expose status only, never messages or transcripts.

## Development and verification

Requires Node 24+.

```sh
npm ci
cp .env.example .env
# Set the token privately and use a test guild.
npm run check
npm test
npm start
```

Automated tests exercise inbound DM routing, private permissions, duplicate events, nonmember/block rejection, successful and failed staff replies, internal-note isolation, escalation, claim conflicts, archive failures, close/new-conversation behavior, restart recovery, legacy-data preservation, panel layout, and banner persistence.

Live acceptance after deployment:

1. Run `/setup` and `/panel` in the configured server.
2. From a regular member account, DM the bot text and an attachment. Confirm a private `mail-…` channel is created and the member cannot view it.
3. As Support, use `/modmail reply`. Confirm the member receives it through the bot.
4. Send an ordinary staff-channel message and `/modmail note`. Confirm neither reaches the member.
5. Escalate, then verify Support loses access while admins retain it.
6. Close as an admin, confirm the private transcript and closure DM, then send another member DM to start a new conversation.
7. Restart the service and verify the existing open conversation still receives messages. Test disabled DMs to confirm failure is reported honestly.

Live Discord/Render verification requires credentials and has not been performed by the automated tests.
