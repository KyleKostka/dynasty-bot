// CFB 13-0 Run — seeds the school list into Supabase, then posts the public "Play" wall.
// /api/games/streak?key=GAMES_SECRET
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID  = process.env.GAMES_CHANNEL_ID;
const GAMES_SECRET= process.env.GAMES_SECRET;
const SB_URL      = process.env.SUPABASE_URL;
const SB_KEY      = process.env.SUPABASE_SERVICE_KEY;
const API = "https://discord.com/api/v10";
const HJ  = { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" };
const sb = (path, init = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });

const FBS_NAMES = ["Alabama","Arkansas","Auburn","Florida","Georgia","Kentucky","LSU","Mississippi State","Missouri","Oklahoma","Ole Miss","South Carolina","Tennessee","Texas","Texas A&M","Vanderbilt","Illinois","Indiana","Iowa","Maryland","Michigan","Michigan State","Minnesota","Nebraska","Northwestern","Ohio State","Oregon","Penn State","Purdue","Rutgers","UCLA","USC","Washington","Wisconsin","Arizona","Arizona State","Baylor","BYU","Cincinnati","Colorado","Houston","Iowa State","Kansas","Kansas State","Oklahoma State","TCU","Texas Tech","UCF","Utah","West Virginia","Boston College","California","Clemson","Duke","Florida State","Georgia Tech","Louisville","Miami","NC State","North Carolina","Pittsburgh","SMU","Stanford","Syracuse","Virginia","Virginia Tech","Wake Forest","Oregon State","Washington State","Boise State","Colorado State","Fresno State","San Diego State","Utah State","Texas State","Army","Charlotte","East Carolina","Florida Atlantic","Liberty","Memphis","Navy","North Texas","Rice","Sam Houston","South Florida","Temple","Tulane","Tulsa","UAB","UTSA","Air Force","Hawaii","Nevada","New Mexico","North Dakota State","Northern Illinois","San Jose State","UNLV","UTEP","Wyoming","Akron","Ball State","Bowling Green","Buffalo","Central Michigan","Eastern Michigan","Kent State","Massachusetts","Miami (OH)","Middle Tennessee","Ohio","Sacramento State","Toledo","Western Kentucky","Western Michigan","Appalachian State","Arkansas State","Coastal Carolina","Georgia Southern","Georgia State","James Madison","Louisiana","UL Monroe","Marshall","Old Dominion","South Alabama","Southern Miss","Troy","Delaware","FIU","Jacksonville State","Kennesaw State","Lamar","Louisiana Tech","McNeese","Missouri State","New Mexico State","Notre Dame","UConn"];
const ALIASES = { "Ole Miss":"Mississippi", "UConn":"Connecticut", "FIU":"Florida International", "Hawaii":"Hawai'i", "App State":"Appalachian State", "UL Monroe":"Louisiana Monroe", "Southern Miss":"Southern Mississippi" };
const norm = (s) => (s||"").normalize("NFKD").replace(/[^a-zA-Z0-9]/g,"").toLowerCase();

async function seedSchools() {
  const j = await (await fetch("https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=400")).json();
  const teams = j.sports[0].leagues[0].teams.map(t => t.team).filter(t => t.logos && t.logos[0]);
  const idx = {};
  for (const t of teams) { for (const k of [t.location, t.displayName, t.shortDisplayName]) if (k) idx[norm(k)] = idx[norm(k)] || t.id; }
  const rows = [];
  for (const name of FBS_NAMES) {
    const id = idx[norm(name)] || (ALIASES[name] && idx[norm(ALIASES[name])]);
    if (id) rows.push({ espn: id, name });
  }
  if (rows.length) await sb("dyn_schools?on_conflict=espn", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows) });
  return rows.length;
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  if (!GAMES_SECRET || url.searchParams.get("key") !== GAMES_SECRET) { res.status(401).json({ error: "bad key" }); return; }
  try {
    const seeded = await seedSchools();
    const content =
      `🏈 **CFB 13-0 Run** — go undefeated!\n` +
      `Identify team logos one after another. **13 in a row = perfect season** 🏆. One miss ends your run. Beat the leaderboard!`;
    const components = [{ type: 1, components: [{ type: 2, style: 3, label: "▶ Play", custom_id: "p13s" }, { type: 2, style: 2, label: "🏆 Leaderboard", custom_id: "p13lb" }] }];
    let posted = false;
    if (!url.searchParams.get("seedonly")) {
      const r = await fetch(`${API}/channels/${CHANNEL_ID}/messages`, { method: "POST", headers: HJ, body: JSON.stringify({ content, components }) });
      posted = r.ok;
    }
    res.status(200).json({ ok: true, seeded, posted });
  } catch (e) { res.status(500).json({ error: String(e) }); }
}
