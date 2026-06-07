// All FBS team picker data, grouped by conference — accurate 2026-27 alignment.
// Each team: [roleName, emoji]. roleName must match (or will create) the Discord role.
const CONFERENCES = [
  { key: "SEC", label: "🏈 SEC", teams: [
    ["Alabama","🐘"],["Arkansas","🐗"],["Auburn","🦅"],["Florida","🐊"],["Georgia","🐶"],
    ["Kentucky","🐱"],["LSU","🐯"],["Mississippi State","🔔"],["Missouri","🐅"],["Oklahoma","🌾"],
    ["Ole Miss","🦈"],["South Carolina","🐓"],["Tennessee","🍊"],["Texas","🤘"],["Texas A&M","👍"],["Vanderbilt","⚓"]
  ]},
  { key: "B1G", label: "🌽 Big Ten", teams: [
    ["Illinois","🟧"],["Indiana","🍬"],["Iowa","🦅"],["Maryland","🐢"],["Michigan","〽️"],
    ["Michigan State","🛡️"],["Minnesota","🐿️"],["Nebraska","🌽"],["Northwestern","🐾"],["Ohio State","🌰"],
    ["Oregon","🦆"],["Penn State","🦁"],["Purdue","🚂"],["Rutgers","🔴"],["UCLA","🐻"],
    ["USC","⚔️"],["Washington","🐺"],["Wisconsin","🦡"]
  ]},
  { key: "B12", label: "🤠 Big 12", teams: [
    ["Arizona","🌵"],["Arizona State","🔱"],["Baylor","🐻"],["BYU","🟦"],["Cincinnati","🐈‍⬛"],
    ["Colorado","🦬"],["Houston","🐈"],["Iowa State","🌪️"],["Kansas","🐦"],["Kansas State","🐱"],
    ["Oklahoma State","🤠"],["TCU","🐸"],["Texas Tech","🐎"],["UCF","🗡️"],["Utah","🏔️"],["West Virginia","⛰️"]
  ]},
  { key: "ACC", label: "🌀 ACC", teams: [
    ["Boston College","🦅"],["California","🐻"],["Clemson","🐾"],["Duke","👿"],["Florida State","🪶"],
    ["Georgia Tech","🐝"],["Louisville","🐦"],["Miami","🌀"],["NC State","🐺"],["North Carolina","🐏"],
    ["Pittsburgh","🐾"],["SMU","🐎"],["Stanford","🌲"],["Syracuse","🍊"],["Virginia","⚔️"],
    ["Virginia Tech","🦃"],["Wake Forest","🎩"]
  ]},
  { key: "PAC", label: "🌲 Pac-12", teams: [
    ["Oregon State","🦫"],["Washington State","🐾"],["Boise State","🐴"],["Colorado State","🐏"],
    ["Fresno State","🐶"],["San Diego State","🗿"],["Utah State","🐂"],["Texas State","🐱"]
  ]},
  { key: "AAC", label: "⚓ American", teams: [
    ["Army","🎖️"],["Charlotte","⛏️"],["East Carolina","🏴‍☠️"],["Florida Atlantic","🦉"],["Liberty","🔥"],
    ["Memphis","🐅"],["Navy","⚓"],["North Texas","🟢"],["Rice","🦉"],["Sam Houston","🐈‍⬛"],
    ["South Florida","🐂"],["Temple","🦉"],["Tulane","🌊"],["Tulsa","🌀"],["UAB","🐉"],["UTSA","🐦"]
  ]},
  { key: "MW", label: "⛰️ Mountain West", teams: [
    ["Air Force","🦅"],["Hawaii","🌈"],["Nevada","🐺"],["New Mexico","🐺"],["North Dakota State","🦬"],
    ["Northern Illinois","🐾"],["San Jose State","🛡️"],["UNLV","🤠"],["UTEP","⛏️"],["Wyoming","🤠"]
  ]},
  { key: "MAC", label: "🚀 MAC", teams: [
    ["Akron","🦘"],["Ball State","🐦"],["Bowling Green","🦅"],["Buffalo","🐂"],["Central Michigan","🪶"],
    ["Eastern Michigan","🦅"],["Kent State","⚡"],["Massachusetts","🎩"],["Miami (OH)","🪶"],["Middle Tennessee","🔵"],
    ["Ohio","🐱"],["Sacramento State","🐝"],["Toledo","🚀"],["Western Kentucky","🔴"],["Western Michigan","🐴"]
  ]},
  { key: "SBC", label: "🌶️ Sun Belt", teams: [
    ["Appalachian State","⛰️"],["Arkansas State","🐺"],["Coastal Carolina","🐓"],["Georgia Southern","🦅"],["Georgia State","🐾"],
    ["James Madison","👑"],["Louisiana","🌶️"],["UL Monroe","🦅"],["Marshall","🐃"],["Old Dominion","👑"],
    ["South Alabama","🐆"],["Southern Miss","🦅"],["Troy","⚔️"]
  ]},
  { key: "CUSA", label: "🔥 Conference USA", teams: [
    ["Delaware","🐔"],["FIU","🐾"],["Jacksonville State","🐓"],["Kennesaw State","🦉"],["Lamar","🐦"],
    ["Louisiana Tech","🐶"],["McNeese","🤠"],["Missouri State","🐻"],["New Mexico State","🐂"]
  ]},
  { key: "IND", label: "☘️ Independents", teams: [
    ["Notre Dame","☘️"],["UConn","🐺"]
  ]}
];


const BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID   = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const SETUP_SECRET = process.env.SETUP_SECRET;

const API = "https://discord.com/api/v10";
const H = { Authorization: `Bot ${BOT_TOKEN}` };
const HJ = { ...H, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getRoles() {
  const r = await fetch(`${API}/guilds/${GUILD_ID}/roles`, { headers: H });
  if (!r.ok) throw new Error(`roles fetch failed: ${r.status}`);
  const roles = await r.json();
  const map = new Map();
  for (const role of roles) map.set(role.name.trim().toLowerCase(), role.id);
  return map;
}

async function createRole(name) {
  const r = await fetch(`${API}/guilds/${GUILD_ID}/roles`, {
    method: "POST", headers: HJ,
    body: JSON.stringify({ name, mentionable: true })
  });
  if (!r.ok) throw new Error(`create role '${name}' failed: ${r.status} ${await r.text()}`);
  const role = await r.json();
  return role.id;
}

// Create any team roles that don't yet exist; returns updated map + list created.
async function ensureRoles(roleMap) {
  const created = [];
  for (const conf of CONFERENCES) {
    for (const [name] of conf.teams) {
      if (!roleMap.get(name.trim().toLowerCase())) {
        const id = await createRole(name);
        roleMap.set(name.trim().toLowerCase(), id);
        created.push(name);
        await sleep(400);
      }
    }
  }
  return created;
}

async function renameGuild(name) {
  const r = await fetch(`${API}/guilds/${GUILD_ID}`, {
    method: "PATCH", headers: HJ, body: JSON.stringify({ name })
  });
  return { ok: r.ok, status: r.status, detail: r.ok ? "" : await r.text() };
}

// Delete all recent (<14d) messages in the picker channel so we can repost clean.
async function clearChannel() {
  const r = await fetch(`${API}/channels/${CHANNEL_ID}/messages?limit=100`, { headers: H });
  if (!r.ok) return { ok: false, status: r.status };
  const msgs = await r.json();
  const ids = msgs.map((m) => m.id);
  if (ids.length === 0) return { ok: true, deleted: 0 };
  if (ids.length === 1) {
    await fetch(`${API}/channels/${CHANNEL_ID}/messages/${ids[0]}`, { method: "DELETE", headers: H });
    return { ok: true, deleted: 1 };
  }
  const br = await fetch(`${API}/channels/${CHANNEL_ID}/messages/bulk-delete`, {
    method: "POST", headers: HJ, body: JSON.stringify({ messages: ids })
  });
  return { ok: br.ok, deleted: br.ok ? ids.length : 0, status: br.status, detail: br.ok ? "" : await br.text() };
}

async function postConference(conf, roleMap) {
  const options = [];
  const missing = [];
  for (const [name, emoji] of conf.teams) {
    const id = roleMap.get(name.trim().toLowerCase());
    if (!id) { missing.push(name); continue; }
    const opt = { label: name, value: id };
    if (emoji) opt.emoji = { name: emoji };
    options.push(opt);
  }
  if (!options.length) return { conf: conf.key, posted: false, missing };

  const payload = {
    content: `**${conf.label}** — pick your school from the dropdown:`,
    components: [{
      type: 1,
      components: [{
        type: 3,
        custom_id: `teampick:${conf.key}`,
        placeholder: `Select your ${conf.key} team…`,
        min_values: 1, max_values: 1, options
      }]
    }]
  };

  const r = await fetch(`${API}/channels/${CHANNEL_ID}/messages`, {
    method: "POST", headers: HJ, body: JSON.stringify(payload)
  });
  return { conf: conf.key, posted: r.ok, count: options.length, missing, error: r.ok ? "" : await r.text() };
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const key = url.searchParams.get("key");
  if (!SETUP_SECRET || key !== SETUP_SECRET) { res.status(401).json({ error: "bad key" }); return; }

  const which   = (url.searchParams.get("conf") || "").toUpperCase();
  const rename  = url.searchParams.get("rename");
  const clear   = url.searchParams.get("clear") === "1";
  const mkroles = url.searchParams.get("createroles") === "1";

  try {
    const out = {};

    if (rename) out.rename = await renameGuild(rename);

    const roleMap = await getRoles();

    if (mkroles || which) out.createdRoles = await ensureRoles(roleMap);

    if (clear) out.cleared = await clearChannel();

    if (which) {
      const list = which === "ALL" ? CONFERENCES : CONFERENCES.filter((c) => c.key === which);
      if (!list.length) { res.status(400).json({ error: `unknown conf '${which}'`, valid: CONFERENCES.map(c=>c.key) }); return; }
      out.posted = [];
      for (const conf of list) { out.posted.push(await postConference(conf, roleMap)); await sleep(600); }
    }

    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
