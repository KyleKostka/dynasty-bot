import nacl from "tweetnacl";

export const config = { api: { bodyParser: false } };

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID   = process.env.GUILD_ID;

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
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

  // PING
  if (body.type === 1) { res.status(200).json({ type: 1 }); return; }

  // Message component (dropdown select)
  if (body.type === 3) {
    try {
      const userId = body.member?.user?.id;
      const have = new Set(body.member?.roles || []);
      const values = body.data?.values || [];
      const lines = [];
      for (const roleId of values) {
        const had = have.has(roleId);
        const url = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`;
        const r = await fetch(url, {
          method: had ? "DELETE" : "PUT",
          headers: { Authorization: `Bot ${BOT_TOKEN}`, "X-Audit-Log-Reason": "Team picker" }
        });
        if (r.ok) lines.push(`${had ? "❌ Removed" : "✅ Added"} <@&${roleId}>`);
        else lines.push(`⚠️ Couldn't update <@&${roleId}> (check my role position).`);
      }
      res.status(200).json({ type: 4, data: { flags: 64, content: lines.join("\n") || "No change." } });
    } catch (e) {
      res.status(200).json({ type: 4, data: { flags: 64, content: "Something went wrong, try again." } });
    }
    return;
  }

  res.status(200).json({ type: 4, data: { flags: 64, content: "Unsupported interaction." } });
}

