import nacl from "tweetnacl";

export const config = { api: { bodyParser: false } };

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID   = process.env.GUILD_ID;
const SB_URL     = process.env.SUPABASE_URL;
const SB_KEY     = process.env.SUPABASE_SERVICE_KEY;

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const sb = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

const ephemeral = (res, content) => res.status(200).json({ type: 4, data: { flags: 64, content } });

// --- "Guess the Mascot" button click ---
async function handleMascotGuess(res, body) {
  const [, roundDate, guess] = (body.data.custom_id || "").split("|");
  const user = body.member?.user || body.user || {};
  const userId = user.id;
  const username = user.global_name || user.username || "someone";

  const rq = await sb(`dyn_mascot_rounds?round_date=eq.${roundDate}&select=answer,nickname,emoji`);
  const rows = rq.ok ? await rq.json() : [];
  if (!rows.length) return ephemeral(res, "That round isn't available anymore.");
  const round = rows[0];
  const correct = guess === round.answer;

  const ins = await sb("dyn_mascot_guesses", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ round_date: roundDate, user_id: userId, username, guess, correct }),
  });
  if (ins.status === 409) return ephemeral(res, "\u{1F512} You already locked in a guess for today. Come back tomorrow!");
  if (!ins.ok) return ephemeral(res, "Couldn't record your guess - try again in a sec.");

  return ephemeral(res, correct
    ? `✅ **Correct!** It's the ${round.nickname} ${round.emoji || ""}. Nice. (Public reveal drops tomorrow.)`
    : `❌ You locked in **${guess}**. Not it - the answer reveals tomorrow. One guess only!`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

  const sig = req.headers["x-signature-ed25519"];
  const ts  = req.headers["x-signature-timestamp"];
  const raw = await readRaw(req);

  let valid = false;
  try {
    valid = sig && ts && PUBLIC_KEY && nacl.sign.detached.verify(
      Buffer.from(ts + raw),
      Buffer.from(sig, "hex"),
      Buffer.from(PUBLIC_KEY, "hex")
    );
  } catch { valid = false; }
  if (!valid) { res.status(401).send("invalid request signature"); return; }

  const body = JSON.parse(raw);

  if (body.type === 1) { res.status(200).json({ type: 1 }); return; }

  if (body.type === 3) {
    const customId = body.data?.custom_id || "";

    if (customId.startsWith("mascot|")) {
      try { return await handleMascotGuess(res, body); }
      catch { return ephemeral(res, "Something went wrong recording your guess."); }
    }

    try {
      const userId = body.member?.user?.id;
      const have = new Set(body.member?.roles || []);
      const values = body.data?.values || [];
      for (const roleId of values) {
        const had = have.has(roleId);
        const url = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`;
        await fetch(url, {
          method: had ? "DELETE" : "PUT",
          headers: { Authorization: `Bot ${BOT_TOKEN}`, "X-Audit-Log-Reason": "Team picker" }
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
