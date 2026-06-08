// Daily "Guess the Mascot" — Start-wall + timed, fastest-wins.
// Pool = the recognizable FBS football schools; logo ids resolved from ESPN at runtime.
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID  = process.env.GAMES_CHANNEL_ID;
const GAMES_SECRET= process.env.GAMES_SECRET;
const SB_URL      = process.env.SUPABASE_URL;
const SB_KEY      = process.env.SUPABASE_SERVICE_KEY;

const API  = "https://discord.com/api/v10";
const HJ   = { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" };
const BASE = "https://dynasty-team-picker.vercel.app";
const COVER  = `${BASE}/api/games/silhouette?cover=1`;
const REVEAL = (id) => `${BASE}/api/games/silhouette?id=${id}&reveal=1`;
const ESPN_FB = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=400";

const FBS_NAMES = ["Alabama","Arkansas","Auburn","Florida","Georgia","Kentucky","LSU","Mississippi State","Missouri","Oklahoma","Ole Miss","South Carolina","Tennessee","Texas","Texas A&M","Vanderbilt","Illinois","Indiana","Iowa","Maryland","Michigan","Michigan State","Minnesota","Nebraska","Northwestern","Ohio State","Oregon","Penn State","Purdue","Rutgers","UCLA","USC","Washington","Wisconsin","Arizona","Arizona State","Baylor","BYU","Cincinnati","Colorado","Houston","Iowa State","Kansas","Kansas State","Oklahoma State","TCU","Texas Tech","UCF","Utah","West Virginia","Boston College","California","Clemson","Duke","Florida State","Georgia Tech","Louisville","Miami","NC State","North Carolina","Pittsburgh","SMU","Stanford","Syracuse","Virginia","Virginia Tech","Wake Forest","Oregon State","Washington State","Boise State","Colorado State","Fresno State","San Diego State","Utah State","Texas State","Army","Charlotte","East Carolina","Florida Atlantic","Liberty","Memphis","Navy","North Texas","Rice","Sam Houston","South Florida","Temple","Tulane","Tulsa","UAB","UTSA","Air Force","Hawaii","Nevada","New Mexico","North Dakota State","Northern Illinois","San Jose State","UNLV","UTEP","Wyoming","Akron","Ball State","Bowling Green","Buffalo","Central Michigan","Eastern Michigan","Kent State","Massachusetts","Miami (OH)","Middle Tennessee","Ohio","Sacramento State","Toledo","Western Kentucky","Western Michigan","Appalachian State","Arkansas State","Coastal Carolina","Georgia Southern","Georgia State","James Madison","Louisiana","UL Monroe","Marshall","Old Dominion","South Alabama","Southern Miss","Troy","Delaware","FIU","Jacksonville State","Kennesaw State","Lamar","Louisiana Tech","McNeese","Missouri State","New Mexico State","Notre Dame","UConn"];
const ALIASES = { "Ole Miss":"Mississippi", "UConn":"Connecticut", "FIU":"Florida International", "Hawaii":"Hawai'i", "App State":"Appalachian State", "Louisiana":"Louisiana", "UL Monroe":"Louisiana Monroe", "Southern Miss":"Southern Mississippi", "Sam Houston":"Sam Houston" };

const sb = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });

const norm = (s) => (s||"").normalize("NFKD").replace(/[^a-zA-Z0-9]/g,"").toLowerCase();
async function loadSchools() {
  const j = await (await fetch(ESPN_FB)).json();
  const teams = j.sports[0].leagues[0].teams.map(t => t.team).filter(t => t.logos && t.logos[0]);
  const idx = {};
  for (const t of teams) { for (const k of [t.location, t.displayName, t.shortDisplayName]) if (k) idx[norm(k)] = idx[norm(k)] || t.id; }
  const out = [];
  for (const name of FBS_NAMES) {
    let id = idx[norm(name)] || (ALIASES[name] && idx[norm(ALIASES[name])]);
    if (!id) { const n = norm(name); const t = teams.find(x => norm(x.location||"").includes(n)); id = t && t.id; }
    if (id) out.push({ name, espn: id });
  }
  out.sort((a, b) => Number(a.espn) - Number(b.espn));
  return out;
}

function seededShuffle(arr, seed) {
  const a = arr.slice(); let s = seed >>> 0;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const todayStr = (tz = "America/Chicago") => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayNumber = (d) => Math.floor(Date.parse(d + "T00:00:00Z") / 86400000);

function pickRound(schools, dateStr) {
  const shuffled = seededShuffle(schools, 20262027);
  const answer = shuffled[dayNumber(dateStr) % shuffled.length];
  const pool = schools.filter(s => s.name !== answer.name);
  const seed = dayNumber(dateStr) ^ 0x9e3779b9;
  const decoys = seededShuffle(pool, seed).slice(0, 3);
  const options = seededShuffle([answer, ...decoys], seed + 7);
  return { answer, options };
}

async function postToday(schools, dateStr) {
  const { answer, options } = pickRound(schools, dateStr);
  const content =
    `🔍 **Guess the Mascot** — ${dateStr}\n` +
    `Tap **▶ Start** to reveal today's silhouette and start your clock. Fastest correct guess wins! 🏆`;
  const embeds = [{ image: { url: COVER }, color: 13770518 }];
  const components = [{ type: 1, components: [{ type: 2, style: 3, label: "▶ Start", custom_id: `mstart|${dateStr}` }] }];
  const r = await fetch(`${API}/channels/${CHANNEL_ID}/messages`, { method: "POST", headers: HJ, body: JSON.stringify({ content, embeds, components }) });
  if (!r.ok) return { ok: false, status: r.status, detail: await r.text() };
  const msg = await r.json();
  await sb("dyn_mascot_rounds", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ round_date: dateStr, answer: answer.name, espn: answer.espn, nickname: answer.name, options: options.map(o => o.name), message_id: msg.id, channel_id: CHANNEL_ID }),
  });
  return { ok: true, message_id: msg.id, answer: answer.name, options: options.map(o => o.name) };
}

async function closePrevious(todayDate) {
  const q = await sb(`dyn_mascot_rounds?round_date=lt.${todayDate}&order=round_date.desc&limit=1`);
  if (!q.ok) return { closed: false, reason: "query failed" };
  const rows = await q.json();
  if (!rows.length) return { closed: false, reason: "no previous round" };
  const prev = rows[0];
  if (!prev.message_id || !prev.espn) return { closed: false, reason: "incomplete prev" };
  const g = await sb(`dyn_mascot_guesses?round_date=eq.${prev.round_date}&correct=eq.true&order=elapsed_ms.asc&select=username,elapsed_ms`);
  const winners = g.ok ? await g.json() : [];
  const fastest = winners[0];
  const content =
    `🔍 **Guess the Mascot** — ${prev.round_date}  ·  ✅ **${prev.answer}**\n` +
    (fastest ? `🏆 Fastest: **${fastest.username}** in ${(fastest.elapsed_ms / 1000).toFixed(1)}s  ·  ${winners.length} got it` : `Nobody got this one!`);
  const embeds = [{ image: { url: REVEAL(prev.espn) }, color: 13770518 }];
  await fetch(`${API}/channels/${prev.channel_id}/messages/${prev.message_id}`, { method: "PATCH", headers: HJ, body: JSON.stringify({ content, embeds, components: [] }) });
  return { closed: true, date: prev.round_date, winners: winners.length };
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  if (!GAMES_SECRET || url.searchParams.get("key") !== GAMES_SECRET) { res.status(401).json({ error: "bad key" }); return; }
  try {
    const dateStr = url.searchParams.get("date") || todayStr();
    const schools = await loadSchools();
    if (schools.length < 50) { res.status(500).json({ error: "school list load failed", got: schools.length }); return; }
    const closed = await closePrevious(dateStr);
    const posted = await postToday(schools, dateStr);
    res.status(200).json({ ok: true, date: dateStr, schools: schools.length, closed, posted });
  } catch (e) { res.status(500).json({ error: String(e) }); }
}
