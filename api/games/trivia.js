// Daily CFB Trivia — question + 4 answer buttons, one guess each, answer revealed next day.
// /api/games/trivia?key=GAMES_SECRET  (run daily by GitHub Actions)
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID  = process.env.GAMES_CHANNEL_ID;
const GAMES_SECRET= process.env.GAMES_SECRET;
const SB_URL      = process.env.SUPABASE_URL;
const SB_KEY      = process.env.SUPABASE_SERVICE_KEY;
const API = "https://discord.com/api/v10";
const HJ  = { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" };

const QUESTIONS = [
  { q: "Which school has won the most consensus national championships in CFB history?", o: ["Alabama", "Notre Dame", "Ohio State", "USC"], a: 0 },
  { q: "Who holds the record for most career passing yards in FBS history (as of 2024)?", o: ["Case Keenum", "Bailey Zappe", "Joe Burrow", "Tua Tagovailoa"], a: 0 },
  { q: "Which trophy is awarded to the winner of the Michigan–Ohio State rivalry... actually, what's it called?", o: ["The Game (no trophy)", "Old Oaken Bucket", "Paul Bunyan's Axe", "Floyd of Rosedale"], a: 0 },
  { q: "What stadium is known as 'The Big House'?", o: ["Michigan Stadium", "Ohio Stadium", "Beaver Stadium", "Tiger Stadium"], a: 0 },
  { q: "Which team does the mascot 'Ralphie' the buffalo belong to?", o: ["Colorado", "Buffalo", "North Dakota State", "Marshall"], a: 0 },
  { q: "Who won the first ever College Football Playoff (2014 season)?", o: ["Ohio State", "Oregon", "Alabama", "Florida State"], a: 0 },
  { q: "Which conference is Notre Dame football an independent from (not a full member)?", o: ["ACC (football independent)", "Big Ten", "Big 12", "SEC"], a: 0 },
  { q: "The 'Iron Bowl' is played between Auburn and which team?", o: ["Alabama", "Georgia", "LSU", "Tennessee"], a: 0 },
  { q: "Which player won the 2020 Heisman Trophy?", o: ["DeVonta Smith", "Mac Jones", "Trevor Lawrence", "Kyle Trask"], a: 0 },
  { q: "What is the oldest rivalry trophy in college football, the 'Territorial Cup', contested by Arizona and...?", o: ["Arizona State", "New Mexico", "Utah", "Colorado"], a: 0 },
  { q: "Which school is nicknamed the 'Crimson Tide'?", o: ["Alabama", "Harvard", "Indiana", "Utah"], a: 0 },
  { q: "Deion Sanders became head coach of which program in 2023?", o: ["Colorado", "Jackson State", "Texas", "Florida State"], a: 0 },
  { q: "Which dotting tradition belongs to Ohio State's marching band?", o: ["Script Ohio", "The Walk", "Jump Around", "Sailgating"], a: 0 },
  { q: "'Touchdown Jesus' overlooks the stadium at which school?", o: ["Notre Dame", "Boston College", "SMU", "TCU"], a: 0 },
  { q: "Which SEC team plays its home games at 'Death Valley' in Baton Rouge?", o: ["LSU", "Clemson", "Tennessee", "Ole Miss"], a: 0 },
  { q: "Who threw the 'Kick Six' return game-winner... which team returned it vs Alabama in 2013?", o: ["Auburn", "Georgia", "Texas A&M", "Tennessee"], a: 0 },
  { q: "Which program does coach Kirby Smart lead?", o: ["Georgia", "Alabama", "South Carolina", "Mississippi State"], a: 0 },
  { q: "The 'Flea Kicker' and 'Bush Push' are famous plays — Reggie Bush played for which school?", o: ["USC", "UCLA", "Texas", "Miami"], a: 0 },
  { q: "Which team's fans 'Jump Around' to a House of Pain song between the 3rd and 4th quarters?", o: ["Wisconsin", "Iowa", "Penn State", "Nebraska"], a: 0 },
  { q: "Who is the only player to win the Heisman Trophy twice?", o: ["Archie Griffin", "Tim Tebow", "Herschel Walker", "Bo Jackson"], a: 0 },
  { q: "Clemson plays its home games in which state?", o: ["South Carolina", "North Carolina", "Georgia", "Virginia"], a: 0 },
  { q: "Which Big Ten school is the Nittany Lions?", o: ["Penn State", "Michigan State", "Rutgers", "Maryland"], a: 0 },
  { q: "The Rose Bowl is located in which city?", o: ["Pasadena", "Los Angeles", "San Diego", "Glendale"], a: 0 },
  { q: "Which team wears the famous gold helmets with no logo... the 'Golden Domers'?", o: ["Notre Dame", "Navy", "Army", "Vanderbilt"], a: 0 },
  { q: "Caleb Williams won the 2022 Heisman while playing for which school?", o: ["USC", "Oklahoma", "LSU", "Ohio State"], a: 0 },
];

const sb = (path, init = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });
const todayStr = (tz = "America/Chicago") => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayNumber = (d) => Math.floor(Date.parse(d + "T00:00:00Z") / 86400000);
function shuffle(arr, seed) { const a = arr.slice(); let s = seed >>> 0; const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function postToday(dateStr) {
  const base = QUESTIONS[dayNumber(dateStr) % QUESTIONS.length];
  const correctText = base.o[base.a];
  const opts = shuffle(base.o, dayNumber(dateStr) ^ 0x51); // shuffle answer position
  const correctIdx = opts.indexOf(correctText);
  const letters = ["🇦", "🇧", "🇨", "🇩"];
  const content = `🧠 **CFB Trivia** — ${dateStr}\n**${base.q}**\n\n` + opts.map((o, i) => `${letters[i]} ${o}`).join("\n") + `\n\n_One guess each — answer revealed tomorrow._`;
  const components = [{ type: 1, components: opts.map((o, i) => ({ type: 2, style: 1, label: String.fromCharCode(65 + i), custom_id: `tg|${dateStr}|${i}` })) }];
  const r = await fetch(`${API}/channels/${CHANNEL_ID}/messages`, { method: "POST", headers: HJ, body: JSON.stringify({ content, components }) });
  if (!r.ok) return { ok: false, status: r.status, detail: await r.text() };
  const msg = await r.json();
  await sb("dyn_trivia_rounds", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ round_date: dateStr, question: base.q, options: opts, correct_idx: correctIdx, answer: correctText, message_id: msg.id, channel_id: CHANNEL_ID }) });
  return { ok: true, message_id: msg.id, answer: correctText };
}

async function closePrevious(todayDate) {
  const q = await sb(`dyn_trivia_rounds?round_date=lt.${todayDate}&order=round_date.desc&limit=1`);
  if (!q.ok) return { closed: false };
  const rows = await q.json();
  if (!rows.length || !rows[0].message_id) return { closed: false };
  const prev = rows[0];
  const g = await sb(`dyn_trivia_guesses?round_date=eq.${prev.round_date}&correct=eq.true&select=username`);
  const winners = g.ok ? await g.json() : [];
  const names = winners.map(w => w.username).filter(Boolean);
  const content = `🧠 **CFB Trivia** — ${prev.round_date}\n**${prev.question}**\n✅ Answer: **${prev.answer}**\n` + (names.length ? `Got it: ${names.join(", ")}` : `Nobody got this one!`);
  await fetch(`${API}/channels/${prev.channel_id}/messages/${prev.message_id}`, { method: "PATCH", headers: HJ, body: JSON.stringify({ content, components: [] }) });
  return { closed: true, date: prev.round_date };
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  if (!GAMES_SECRET || url.searchParams.get("key") !== GAMES_SECRET) { res.status(401).json({ error: "bad key" }); return; }
  try {
    const dateStr = url.searchParams.get("date") || todayStr();
    const closed = await closePrevious(dateStr);
    const posted = await postToday(dateStr);
    res.status(200).json({ ok: true, date: dateStr, closed, posted });
  } catch (e) { res.status(500).json({ error: String(e) }); }
}
