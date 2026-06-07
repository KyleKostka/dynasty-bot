// All FBS team picker data, grouped by conference.
// Each team: [roleName, emoji]. roleName must match the Discord role name exactly.
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
    ["Oregon State","🦫"],["Washington State","🐾"]
  ]},
  { key: "AAC", label: "⚓ American (AAC)", teams: [
    ["Army","🎖️"],["Charlotte","⛏️"],["East Carolina","🏴‍☠️"],["Florida Atlantic","🦉"],["Memphis","🐅"],
    ["Navy","⚓"],["North Texas","🟢"],["Rice","🦉"],["South Florida","🐂"],["Temple","🦉"],
    ["Tulane","🌊"],["Tulsa","🌀"],["UAB","🔥"],["UTSA","🐦"]
  ]},
  { key: "MW", label: "⛰️ Mountain West", teams: [
    ["Air Force","🦅"],["Boise State","🐴"],["Colorado State","🐏"],["Fresno State","🐶"],["Hawaii","🌈"],
    ["Nevada","🐺"],["New Mexico","🐺"],["San Diego State","🗿"],["San Jose State","🛡️"],["UNLV","🤠"],
    ["Utah State","🐂"],["Wyoming","🤠"]
  ]},
  { key: "MAC", label: "🚀 MAC", teams: [
    ["Akron","🦘"],["Ball State","🐦"],["Bowling Green","🦅"],["Buffalo","🐂"],["Central Michigan","🪶"],
    ["Eastern Michigan","🦅"],["Kent State","⚡"],["Massachusetts","🎩"],["Miami (OH)","🦅"],["Northern Illinois","🐺"],
    ["Ohio","🐱"],["Toledo","🚀"],["Western Michigan","🐴"]
  ]},
  { key: "SBC", label: "🌶️ Sun Belt", teams: [
    ["Appalachian State","⛰️"],["Arkansas State","🐺"],["Coastal Carolina","🐓"],["Georgia Southern","🦅"],["Georgia State","🐾"],
    ["James Madison","👑"],["Louisiana","🌶️"],["UL Monroe","🦅"],["Marshall","🐃"],["Old Dominion","👑"],
    ["South Alabama","🐆"],["Southern Miss","🦅"],["Texas State","🐱"],["Troy","⚔️"]
  ]},
  { key: "CUSA", label: "🔥 Conference USA", teams: [
    ["Delaware","🐔"],["FIU","🐾"],["Jacksonville State","🐓"],["Kennesaw State","🦉"],["Liberty","🔥"],
    ["Louisiana Tech","🐶"],["Middle Tennessee","🐴"],["Missouri State","🐻"],["New Mexico State","🐂"],["Sam Houston","🐈‍⬛"],
    ["UTEP","⛏️"],["Western Kentucky","🔴"]
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getRoles() {
  const r = await fetch(`${API}/guilds/${GUILD_ID}/roles`, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` }
  });
  if (!r.ok) throw new Error(`roles fetch failed: ${r.status}`);
  const roles = await r.json();
  const map = new Map();
  for (const role of roles) map.set(role.name.trim().toLowerCase(), role.id);
  return map;
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
        min_values: 1,
        max_values: 1,
        options
      }]
    }]
  };

  const r = await fetch(`${API}/channels/${CHANNEL_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const ok = r.ok;
  const detail = ok ? "" : await r.text();
  return { conf: conf.key, posted: ok, count: options.length, missing, error: detail };
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const key = url.searchParams.get("key");
  const which = (url.searchParams.get("conf") || "").toUpperCase();

  if (!SETUP_SECRET || key !== SETUP_SECRET) { res.status(401).json({ error: "bad key" }); return; }
  if (!which) { res.status(400).json({ error: "pass ?conf=SEC or ?conf=ALL" }); return; }

  try {
    const roleMap = await getRoles();
    const list = which === "ALL" ? CONFERENCES : CONFERENCES.filter((c) => c.key === which);
    if (!list.length) { res.status(400).json({ error: `unknown conf '${which}'`, valid: CONFERENCES.map(c=>c.key) }); return; }

    const results = [];
    for (const conf of list) {
      results.push(await postConference(conf, roleMap));
      await sleep(600);
    }
    res.status(200).json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
