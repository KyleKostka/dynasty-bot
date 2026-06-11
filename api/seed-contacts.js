// One-off endpoint: seed the league contact list into dyn_coaches from the contact-list
// table image, resolving each coach's REAL Discord ID by matching their handle to a member.
// Visit:  /api/seed-contacts?key=YOUR_SETUP_SECRET   (then run /contacts in Discord)
//
// Needs the bot's "Server Members Intent" enabled (Discord Developer Portal → Bot →
// Privileged Gateway Intents). Handles that can't be matched are reported and skipped
// (so the advance board isn't polluted with users who can't actually check in).

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const SETUP_SECRET = process.env.SETUP_SECRET;
const DISCORD = "https://discord.com/api/v10";

// Known real IDs so existing rows don't duplicate.
const KNOWN = { kostka30: "628315969193902080" };

// Transcribed from the #contact-list table image. handle = the "Discord" column.
const COACHES = [
  { handle: "AlexJ",      first_name: "Alex Jenson",     gamertag: "KKBYE",         team: "VA Tech",          phone: "(320) 224-1352", tz: "ET" },
  { handle: "deers",      first_name: "Andy Deering",    gamertag: "DEER BEAR 28",  team: "TCU",              phone: "(412) 377-1339", tz: "ET" },
  { handle: "Domeski23",  first_name: "",                gamertag: "Domeski23",     team: "USC",              phone: "",               tz: "" },
  { handle: "Heggy09",    first_name: "Nate Hegstrom",   gamertag: "Heggy09",       team: "Iowa",             phone: "(218) 851-8588", tz: "MT" },
  { handle: "jays2107",   first_name: "Soren Grandall",  gamertag: "Jays2107",      team: "GA Tech",          phone: "507-319-7404",   tz: "CT" },
  { handle: "Kaine",      first_name: "Kaine Drummer",   gamertag: "YungDew33",     team: "South Carolina",   phone: "",               tz: "" },
  { handle: "Kilch",      first_name: "John Kilchenman", gamertag: "Kilch5",        team: "Washington State", phone: "(952) 913-2512", tz: "CT" },
  { handle: "Kostka30",   first_name: "Kyle Kostka",     gamertag: "Kostka30",      team: "Arkansas",         phone: "(218) 838-3530", tz: "MT" },
  { handle: "Lokensgard", first_name: "Tom Lokensgard",  gamertag: "TLokes16",      team: "UCF",              phone: "",               tz: "" },
  { handle: "Mccaulley69", first_name: "Alan McCaulley", gamertag: "McCaulley75",   team: "SMU",              phone: "(507) 696-3597", tz: "CT" },
  { handle: "RickFly3",   first_name: "Nick Bly",        gamertag: "RickFly3",      team: "Baylor",           phone: "(507) 696-3968", tz: "CT" },
  { handle: "Rusty Shackleford", first_name: "Tom Glackin", gamertag: "Floyd Manpine", team: "UCLA",          phone: "(717) 283-9133", tz: "ET" },
  { handle: "tkort",      first_name: "TJ Korthour",     gamertag: "tkort",         team: "Minnesota",        phone: "(605) 881-6395", tz: "CT" },
  { handle: "Tots",       first_name: "Josh Jenson",     gamertag: "Zinged",        team: "Mizzou",           phone: "(320) 282-6832", tz: "CT" },
  { handle: "Lou Holtz's Ghost", first_name: "Wille Fust", gamertag: "Bill6923",    team: "Purdue",           phone: "(763) 898-2653", tz: "CT" },
];

async function allMembers() {
  let after = "0", out = [];
  while (true) {
    const r = await fetch(`${DISCORD}/guilds/${GUILD_ID}/members?limit=1000&after=${after}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
    if (!r.ok) return { error: `${r.status} ${(await r.text()).slice(0, 200)}` };
    const page = await r.json();
    out = out.concat(page);
    if (page.length < 1000) break;
    after = page[page.length - 1].user.id;
  }
  return { members: out };
}
const sb = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates", ...(init.headers || {}) } });

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  if (!SETUP_SECRET || url.searchParams.get("key") !== SETUP_SECRET) { res.status(401).json({ error: "bad key" }); return; }
  if (!BOT_TOKEN || !GUILD_ID || !SB_URL || !SB_KEY) { res.status(500).json({ error: "missing env vars" }); return; }

  const mres = await allMembers();
  if (mres.error) {
    res.status(500).json({ error: "Couldn't fetch members — turn on the bot's Server Members Intent in the Discord Developer Portal, then try again.", detail: mres.error });
    return;
  }
  const norm = (s) => (s || "").toLowerCase().trim();
  const find = (h) => mres.members.find((m) => [m.user && m.user.username, m.user && m.user.global_name, m.nick].map(norm).includes(norm(h)));

  const seeded = [], skipped = [];
  for (const c of COACHES) {
    const m = find(c.handle);
    const user_id = m ? m.user.id : KNOWN[norm(c.handle)];
    if (!user_id) { skipped.push(c.handle); continue; }
    const username = m ? (m.user.global_name || m.user.username) : c.handle;
    const r = await sb("dyn_coaches?on_conflict=user_id", { method: "POST", body: JSON.stringify({ user_id, username, active: true, first_name: c.first_name || null, gamertag: c.gamertag || null, team: c.team || null, phone: c.phone || null, tz: c.tz || null }) });
    seeded.push({ handle: c.handle, user_id, ok: r.ok });
  }
  res.status(200).json({ ok: true, seeded: seeded.length, skipped, note: skipped.length ? "Skipped handles weren't found as members — check their Discord names, or they'll need to /setinfo themselves." : "All matched.", detail: seeded });
}
