// One-off endpoint to (re)register the guild slash commands with Discord.
// Call once after deploy:  /api/register-commands?key=YOUR_SETUP_SECRET
// Re-run any time you change the COMMANDS list below.

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SETUP_SECRET = process.env.SETUP_SECRET;

// type 1 = CHAT_INPUT (slash). option type 4 = INTEGER.
// Commissioner gating is enforced in code (admin or "Commissioner" role), so
// these stay visible to everyone and reject non-commissioners with a message.
const COMMANDS = [
  { name: "done", description: "Mark yourself advanced for the current week", type: 1 },
  { name: "status", description: "See who still needs to advance this week", type: 1 },
  { name: "myteam", description: "Show your current team", type: 1 },
  { name: "advance", description: "(Commissioner) Advance the league to the next week", type: 1 },
  {
    name: "week",
    description: "(Commissioner) Set the current week",
    type: 1,
    options: [{ name: "number", description: "Week number", type: 4, required: true }],
  },
];

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  if (!SETUP_SECRET || url.searchParams.get("key") !== SETUP_SECRET) {
    res.status(401).json({ error: "bad key" });
    return;
  }
  if (!APP_ID || !BOT_TOKEN || !GUILD_ID) {
    res.status(500).json({ error: "missing DISCORD_APP_ID / DISCORD_BOT_TOKEN / GUILD_ID env" });
    return;
  }
  const r = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(COMMANDS),
  });
  const text = await r.text();
  res.status(r.ok ? 200 : 500).json({ ok: r.ok, status: r.status, registered: COMMANDS.map((c) => c.name), body: text.slice(0, 2000) });
}
