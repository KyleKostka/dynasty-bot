import nacl from "tweetnacl";

export const config = { api: { bodyParser: false } };

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID   = process.env.GUILD_ID;
const SB_URL     = process.env.SUPABASE_URL;
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY;
const BASE       = "https://dynasty-team-picker.vercel.app";
const SIL = (id) => `${BASE}/api/games/silhouette?id=${id}`;

const FBS_NAMES = ["Alabama","Arkansas","Auburn","Florida","Georgia","Kentucky","LSU","Mississippi State","Missouri","Oklahoma","Ole Miss","South Carolina","Tennessee","Texas","Texas A&M","Vanderbilt","Illinois","Indiana","Iowa","Maryland","Michigan","Michigan State","Minnesota","Nebraska","Northwestern","Ohio State","Oregon","Penn State","Purdue","Rutgers","UCLA","USC","Washington","Wisconsin","Arizona","Arizona State","Baylor","BYU","Cincinnati","Colorado","Houston","Iowa State","Kansas","Kansas State","Oklahoma State","TCU","Texas Tech","UCF","Utah","West Virginia","Boston College","California","Clemson","Duke","Florida State","Georgia Tech","Louisville","Miami","NC State","North Carolina","Pittsburgh","SMU","Stanford","Syracuse","Virginia","Virginia Tech","Wake Forest","Oregon State","Washington State","Boise State","Colorado State","Fresno State","San Diego State","Utah State","Texas State","Army","Charlotte","East Carolina","Florida Atlantic","Liberty","Memphis","Navy","North Texas","Rice","Sam Houston","South Florida","Temple","Tulane","Tulsa","UAB","UTSA","Air Force","Hawaii","Nevada","New Mexico","North Dakota State","Northern Illinois","San Jose State","UNLV","UTEP","Wyoming","Akron","Ball State","Bowling Green","Buffalo","Central Michigan","Eastern Michigan","Kent State","Massachusetts","Miami (OH)","Middle Tennessee","Ohio","Sacramento State","Toledo","Western Kentucky","Western Michigan","Appalachian State","Arkansas State","Coastal Carolina","Georgia Southern","Georgia State","James Madison","Louisiana","UL Monroe","Marshall","Old Dominion","South Alabama","Southern Miss","Troy","Delaware","FIU","Jacksonville State","Kennesaw State","Lamar","Louisiana Tech","McNeese","Missouri State","New Mexico State","Notre Dame","UConn"];
const ALIASES = { "Ole Miss":"Mississippi", "UConn":"Connecticut", "FIU":"Florida International", "Hawaii":"Hawai'i", "App State":"Appalachian State", "UL Monroe":"Louisiana Monroe", "Southern Miss":"Southern Mississippi" };

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}
const sb = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });

const ephemeral = (res, data) => res.status(200).json({ type: 4, data: { flags: 64, ...data } });
const update = (res, data) => res.status(200).json({ type: 7, data });
const userOf = (b) => b.member?.user || b.user || {};
const rand = () => Math.floor(Math.random() * 1e9);
function shuffle(arr, seed) { const a = arr.slice(); let s = seed >>> 0; const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const norm = (s) => (s||"").normalize("NFKD").replace(/[^a-zA-Z0-9]/g,"").toLowerCase();
async function loadSchools() {
  const r = await sb("dyn_schools?select=name,espn&limit=300");
  return r.ok ? await r.json() : [];
}

// ---------- Guess the Mascot ----------
async function getMRound(date) {
  const r = await sb(`dyn_mascot_rounds?round_date=eq.${date}&select=answer,espn,options`);
  const rows = r.ok ? await r.json() : []; return rows[0] || null;
}
async function handleStart(res, body) {
  const [, date] = body.data.custom_id.split("|");
  const u = userOf(body);
  const round = await getMRound(date);
  if (!round) return ephemeral(res, { content: "That round isn't available anymore." });
  await sb("dyn_mascot_starts?on_conflict=round_date,user_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ round_date: date, user_id: u.id }) });
  const opts = round.options || [];
  const guessRow = { type: 1, components: opts.map((name) => ({ type: 2, style: 1, label: name, custom_id: `mguess|${date}|${name}` })) };
  const hintRow = { type: 1, components: [{ type: 2, style: 2, label: "💡 Hint", custom_id: `mhint|${date}` }] };
  return ephemeral(res, { content: "⏱️ **Your clock is running!** Which school's logo is this?", embeds: [{ image: { url: SIL(round.espn) }, color: 13770518 }], components: [guessRow, hintRow] });
}
async function handleGuess(res, body) {
  const [, date, guess] = body.data.custom_id.split("|");
  const u = userOf(body); const username = u.global_name || u.username || "someone";
  const round = await getMRound(date);
  if (!round) return ephemeral(res, { content: "That round isn't available anymore." });
  const sr = await sb(`dyn_mascot_starts?round_date=eq.${date}&user_id=eq.${u.id}&select=started_at`);
  const startRows = sr.ok ? await sr.json() : [];
  const startedAt = startRows[0]?.started_at ? new Date(startRows[0].started_at).getTime() : Date.now();
  const elapsed = Math.max(0, Date.now() - startedAt);
  const correct = guess === round.answer;
  const ins = await sb("dyn_mascot_guesses", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ round_date: date, user_id: u.id, username, guess, correct, elapsed_ms: elapsed }) });
  if (ins.status === 409) return ephemeral(res, { content: "🔒 You already locked in a guess for today." });
  if (!ins.ok) return ephemeral(res, { content: "Couldn't record your guess — try again." });
  const secs = (elapsed / 1000).toFixed(1);
  return ephemeral(res, { content: correct ? `✅ **Correct in ${secs}s!** 🏆 Answer reveals tomorrow.` : `❌ **${guess}** isn't it. Locked in at ${secs}s. Answer reveals tomorrow.` });
}
async function handleHint(res, body) {
  const [, date] = body.data.custom_id.split("|");
  const round = await getMRound(date);
  if (!round) return ephemeral(res, { content: "That round isn't available anymore." });
  const a = round.answer || "";
  return ephemeral(res, { content: `💡 Starts with **${a[0]?.toUpperCase() || "?"}** · ${a.replace(/[^A-Za-z]/g, "").length} letters` });
}

// ---------- CFB Trivia ----------
async function handleTrivia(res, body) {
  const [, date, idxStr] = body.data.custom_id.split("|");
  const idx = Number(idxStr);
  const u = userOf(body); const username = u.global_name || u.username || "someone";
  const r = await sb(`dyn_trivia_rounds?round_date=eq.${date}&select=correct_idx,answer`);
  const rows = r.ok ? await r.json() : [];
  if (!rows.length) return ephemeral(res, { content: "That question isn't available anymore." });
  const correct = idx === rows[0].correct_idx;
  const ins = await sb("dyn_trivia_guesses", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ round_date: date, user_id: u.id, username, choice: idx, correct }) });
  if (ins.status === 409) return ephemeral(res, { content: "🔒 You already answered today's trivia." });
  if (!ins.ok) return ephemeral(res, { content: "Couldn't record your answer — try again." });
  return ephemeral(res, { content: correct ? "✅ **Correct!** Nice. (Full answer reveals tomorrow.)" : "❌ Not quite — locked in. Answer reveals tomorrow." });
}

// ---------- CFB 13-0 Run (logo streak) ----------
function buildRounds(schools) {
  const order = shuffle(schools, rand());
  const rounds = [];
  for (let i = 0; i < 13; i++) {
    const answer = order[i];
    const decoys = shuffle(schools.filter(s => s.name !== answer.name), rand()).slice(0, 3);
    const opts = shuffle([answer, ...decoys], rand());
    rounds.push({ espn: answer.espn, name: answer.name, options: opts.map(o => o.name), correctIdx: opts.findIndex(o => o.name === answer.name) });
  }
  return rounds;
}
function roundView(run) {
  const r = run.rounds[run.step];
  return {
    content: `🏈 **CFB 13-0 Run** — **${run.streak}-0** so far. Which team is this? (${run.step + 1}/13)`,
    embeds: [{ image: { url: SIL(r.espn) }, color: 13770518 }],
    components: [{ type: 1, components: r.options.map((name, i) => ({ type: 2, style: 1, label: name, custom_id: `p13a|${run.step}|${i}` })) }],
  };
}
async function handlePlayStart(res, body) {
  const u = userOf(body); const username = u.global_name || u.username || "someone";
  const schools = await loadSchools();
  if (schools.length < 20) return ephemeral(res, { content: "Couldn't load schools — try again." });
  const run = { step: 0, streak: 0, rounds: buildRounds(schools) };
  await sb("dyn_1300_runs?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: u.id, username, current_streak: 0, current_q: run, updated_at: new Date().toISOString() }) });
  return ephemeral(res, roundView(run));
}
async function handlePlayAnswer(res, body) {
  const [, , idxStr] = body.data.custom_id.split("|");
  const optIdx = Number(idxStr);
  const u = userOf(body); const username = u.global_name || u.username || "someone";
  const r = await sb(`dyn_1300_runs?user_id=eq.${u.id}&select=current_q,best_streak`);
  const rows = r.ok ? await r.json() : [];
  if (!rows.length || !rows[0].current_q) return update(res, { content: "That run has ended. Tap ▶ Play to start a new one.", embeds: [], components: [] });
  const run = rows[0].current_q; const best = rows[0].best_streak || 0;
  const round = run.rounds[run.step];
  const correct = optIdx === round.correctIdx;
  if (correct) {
    run.streak += 1; run.step += 1;
    if (run.step >= 13) {
      const nb = Math.max(best, run.streak);
      await sb(`dyn_1300_runs?user_id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ username, best_streak: nb, current_streak: 0, current_q: null }) });
      return update(res, { content: `🏆 **13-0! UNDEFEATED CHAMPION!** ${username} ran the table. National title secured. 🎉`, embeds: [], components: [] });
    }
    await sb(`dyn_1300_runs?user_id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ current_streak: run.streak, current_q: run }) });
    return update(res, roundView(run));
  } else {
    const nb = Math.max(best, run.streak);
    await sb(`dyn_1300_runs?user_id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ username, best_streak: nb, current_streak: 0, current_q: null }) });
    return update(res, { content: `❌ **Loss!** That was **${round.name}**. Final record: **${run.streak}-1**. Your best: **${nb}-0**. Tap ▶ Play to run it back.`, embeds: [], components: [] });
  }
}
async function handleLeaderboard(res) {
  const r = await sb("dyn_1300_runs?order=best_streak.desc&limit=10&select=username,best_streak");
  const rows = r.ok ? await r.json() : [];
  const board = rows.filter(x => x.best_streak > 0).map((x, i) => `${i + 1}. **${x.username}** — ${x.best_streak}-0`).join("\n") || "No runs yet — be the first!";
  return ephemeral(res, { content: `🏆 **13-0 Leaderboard**\n${board}` });
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
  const sig = req.headers["x-signature-ed25519"];
  const ts  = req.headers["x-signature-timestamp"];
  const raw = await readRaw(req);
  let valid = false;
  try { valid = sig && ts && PUBLIC_KEY && nacl.sign.detached.verify(Buffer.from(ts + raw), Buffer.from(sig, "hex"), Buffer.from(PUBLIC_KEY, "hex")); } catch { valid = false; }
  if (!valid) { res.status(401).send("invalid request signature"); return; }

  const body = JSON.parse(raw);
  if (body.type === 1) { res.status(200).json({ type: 1 }); return; }

  if (body.type === 3) {
    const cid = body.data?.custom_id || "";
    try {
      if (cid.startsWith("mstart|")) return await handleStart(res, body);
      if (cid.startsWith("mguess|")) return await handleGuess(res, body);
      if (cid.startsWith("mhint|"))  return await handleHint(res, body);
      if (cid.startsWith("tg|"))     return await handleTrivia(res, body);
      if (cid === "p13s")            return await handlePlayStart(res, body);
      if (cid.startsWith("p13a|"))   return await handlePlayAnswer(res, body);
      if (cid === "p13lb")           return await handleLeaderboard(res);
    } catch (e) { return ephemeral(res, { content: "Something went wrong: " + String(e).slice(0, 100) }); }

    try {
      const userId = body.member?.user?.id;
      const have = new Set(body.member?.roles || []);
      const values = body.data?.values || [];
      for (const roleId of values) {
        const had = have.has(roleId);
        await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`, { method: had ? "DELETE" : "PUT", headers: { Authorization: `Bot ${BOT_TOKEN}`, "X-Audit-Log-Reason": "Team picker" } });
      }
      res.status(200).json({ type: 7, data: { content: body.message.content, components: body.message.components } });
    } catch (e) {
      res.status(200).json({ type: 7, data: { content: body.message?.content, components: body.message?.components } });
    }
    return;
  }
  res.status(200).json({ type: 4, data: { flags: 64, content: "Unsupported interaction." } });
}
