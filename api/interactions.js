import nacl from "tweetnacl";

export const config = { api: { bodyParser: false } };

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID   = process.env.GUILD_ID;
const SB_URL     = process.env.SUPABASE_URL;
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY;
const BASE       = "https://dynasty-team-picker.vercel.app";
const SIL = (id) => `${BASE}/api/games/silhouette?id=${id}`;

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}
const sb = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });

const ephemeral = (res, data) => res.status(200).json({ type: 4, data: { flags: 64, ...data } });
const userOf = (b) => b.member?.user || b.user || {};

async function getRound(date) {
  const r = await sb(`dyn_mascot_rounds?round_date=eq.${date}&select=answer,espn,options`);
  const rows = r.ok ? await r.json() : [];
  return rows[0] || null;
}

// ▶ Start — reveal silhouette + guess/hint buttons, start the player's clock
async function handleStart(res, body) {
  const [, date] = body.data.custom_id.split("|");
  const u = userOf(body);
  const round = await getRound(date);
  if (!round) return ephemeral(res, { content: "That round isn't available anymore." });
  // record start once (ignore if already started -> keeps original time)
  await sb("dyn_mascot_starts?on_conflict=round_date,user_id", {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ round_date: date, user_id: u.id }),
  });
  const opts = round.options || [];
  const guessRow = { type: 1, components: opts.map((name) => ({ type: 2, style: 1, label: name, custom_id: `mguess|${date}|${name}` })) };
  const hintRow = { type: 1, components: [{ type: 2, style: 2, label: "💡 Hint", custom_id: `mhint|${date}` }] };
  return ephemeral(res, {
    content: "⏱️ **Your clock is running!** Which school's logo is this?",
    embeds: [{ image: { url: SIL(round.espn) }, color: 13770518 }],
    components: [guessRow, hintRow],
  });
}

// guess — measure elapsed from the player's start click, record, lock
async function handleGuess(res, body) {
  const [, date, guess] = body.data.custom_id.split("|");
  const u = userOf(body);
  const username = u.global_name || u.username || "someone";
  const round = await getRound(date);
  if (!round) return ephemeral(res, { content: "That round isn't available anymore." });

  const sr = await sb(`dyn_mascot_starts?round_date=eq.${date}&user_id=eq.${u.id}&select=started_at`);
  const startRows = sr.ok ? await sr.json() : [];
  const startedAt = startRows[0]?.started_at ? new Date(startRows[0].started_at).getTime() : Date.now();
  const elapsed = Math.max(0, Date.now() - startedAt);
  const correct = guess === round.answer;

  const ins = await sb("dyn_mascot_guesses", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ round_date: date, user_id: u.id, username, guess, correct, elapsed_ms: elapsed }),
  });
  if (ins.status === 409) return ephemeral(res, { content: "🔒 You already locked in a guess for today." });
  if (!ins.ok) return ephemeral(res, { content: "Couldn't record your guess — try again." });

  const secs = (elapsed / 1000).toFixed(1);
  return ephemeral(res, { content: correct
    ? `✅ **Correct in ${secs}s!** 🏆 Answer reveals tomorrow — check the leaderboard then.`
    : `❌ **${guess}** isn't it. Locked in at ${secs}s. Answer reveals tomorrow.` });
}

async function handleHint(res, body) {
  const [, date] = body.data.custom_id.split("|");
  const round = await getRound(date);
  if (!round) return ephemeral(res, { content: "That round isn't available anymore." });
  const a = round.answer || "";
  const letters = a.replace(/[^A-Za-z]/g, "").length;
  return ephemeral(res, { content: `💡 Starts with **${a[0]?.toUpperCase() || "?"}** · ${letters} letters` });
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
  const sig = req.headers["x-signature-ed25519"];
  const ts  = req.headers["x-signature-timestamp"];
  const raw = await readRaw(req);
  let valid = false;
  try {
    valid = sig && ts && PUBLIC_KEY && nacl.sign.detached.verify(Buffer.from(ts + raw), Buffer.from(sig, "hex"), Buffer.from(PUBLIC_KEY, "hex"));
  } catch { valid = false; }
  if (!valid) { res.status(401).send("invalid request signature"); return; }

  const body = JSON.parse(raw);
  if (body.type === 1) { res.status(200).json({ type: 1 }); return; }

  if (body.type === 3) {
    const cid = body.data?.custom_id || "";
    try {
      if (cid.startsWith("mstart|")) return await handleStart(res, body);
      if (cid.startsWith("mguess|")) return await handleGuess(res, body);
      if (cid.startsWith("mhint|"))  return await handleHint(res, body);
    } catch { return ephemeral(res, { content: "Something went wrong." }); }

    // Team picker dropdown (unchanged)
    try {
      const userId = body.member?.user?.id;
      const have = new Set(body.member?.roles || []);
      const values = body.data?.values || [];
      for (const roleId of values) {
        const had = have.has(roleId);
        await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`, {
          method: had ? "DELETE" : "PUT",
          headers: { Authorization: `Bot ${BOT_TOKEN}`, "X-Audit-Log-Reason": "Team picker" },
        });
      }
      res.status(200).json({ type: 7, data: { content: body.message.content, components: body.message.components } });
    } catch (e) {
      res.status(200).json({ type: 7, data: { content: body.message?.content, components: body.message?.components } });
    }
    return;
  }
  res.status(200).json({ type: 4, data: { flags: 64, content: "Unsupported interaction." } });
}
