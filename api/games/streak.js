// CFB 13-0 Run — public "Play" wall. Each player runs their own logo streak (handled in interactions.js).
// /api/games/streak?key=GAMES_SECRET
const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID  = process.env.GAMES_CHANNEL_ID;
const GAMES_SECRET= process.env.GAMES_SECRET;
const API = "https://discord.com/api/v10";
const HJ  = { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" };
export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  if (!GAMES_SECRET || url.searchParams.get("key") !== GAMES_SECRET) { res.status(401).json({ error: "bad key" }); return; }
  const content =
    `🏈 **CFB 13-0 Run** — go undefeated!\n` +
    `Identify team logos one after another. **13 in a row = perfect season** 🏆. One miss ends your run. Beat the leaderboard!`;
  const components = [{ type: 1, components: [{ type: 2, style: 3, label: "▶ Play", custom_id: "p13s" }, { type: 2, style: 2, label: "🏆 Leaderboard", custom_id: "p13lb" }] }];
  try {
    const r = await fetch(`${API}/channels/${CHANNEL_ID}/messages`, { method: "POST", headers: HJ, body: JSON.stringify({ content, components }) });
    res.status(200).json({ ok: r.ok, status: r.status });
  } catch (e) { res.status(500).json({ error: String(e) }); }
}
