// One-off endpoint to (re)register the guild slash commands with Discord.
// Call after each deploy that changes COMMANDS:
//   /api/register-commands?key=YOUR_SETUP_SECRET

const APP_ID = process.env.DISCORD_APP_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SETUP_SECRET = process.env.SETUP_SECRET;

// type 1 = CHAT_INPUT (slash). option type 4 = INTEGER, type 6 = USER.
// Commissioner gating is enforced in code (admin or "Commissioner" role).
const COMMANDS = [
  { name: "done", description: "Mark yourself done (played) for the current week", type: 1 },
  { name: "status", description: "See the current advance status", type: 1 },
  { name: "myteam", description: "Show your current team", type: 1 },
  { name: "board", description: "(Commissioner) Post the weekly advance board", type: 1 },
  { name: "sim", description: "(Commissioner) Mark a coach's game as simmed", type: 1, options: [{ name: "coach", description: "The coach", type: 6, required: true }] },
  { name: "forcew", description: "(Commissioner) Give a coach a force win", type: 1, options: [{ name: "coach", description: "The coach", type: 6, required: true }] },
  { name: "advance", description: "(Commissioner) Force-advance to the next week", type: 1 },
  { name: "week", description: "(Commissioner) Set the current week (no board post)", type: 1, options: [{ name: "number", description: "Week number", type: 4, required: true }] },

  // --- step-back / control commands ---
  { name: "reset-week", description: "(Commissioner) Clear all check-ins for the current week", type: 1 },
  { name: "go-to-week", description: "(Commissioner) Jump to a specific week and post a fresh board", type: 1, options: [{ name: "number", description: "Week number", type: 4, required: true }] },
  { name: "undo", description: "(Commissioner) Undo a coach's check-in / sim / force-win this week", type: 1, options: [{ name: "coach", description: "The coach", type: 6, required: true }] },
  { name: "offseason", description: "(Commissioner) Advance several weeks at once (default 4)", type: 1, options: [{ name: "weeks", description: "How many weeks (default 4)", type: 4, required: false }] },

  // --- self-service contact list ---
  { name: "setinfo", description: "Set your gamertag and/or timezone for the contact list", type: 1, options: [
    { name: "gamertag", description: "Your gamertag / PSN / Xbox name", type: 3, required: false },
    { name: "timezone", description: "Your timezone (e.g. CT, EST)", type: 3, required: false },
  ] },
  { name: "contacts", description: "(Commissioner) Post the live contact list", type: 1 },
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
