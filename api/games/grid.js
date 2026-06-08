// CFB Ultimate Grid — renders a daily 3x3 immaculate-grid image and posts it.
//   /api/games/grid?img=1&d=<dayNum>  -> PNG of the grid
//   /api/games/grid?key=GAMES_SECRET  -> posts today's grid to the channel
import { createCanvas } from "@napi-rs/canvas";

const BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID  = process.env.GAMES_CHANNEL_ID;
const GAMES_SECRET= process.env.GAMES_SECRET;
const BASE = "https://dynasty-team-picker.vercel.app";
const API  = "https://discord.com/api/v10";
const HJ   = { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" };

// Pools of orthogonal CFB categories. Each daily grid draws 3 cols + 3 rows.
const COLS = ["SEC", "Big Ten", "Big 12", "ACC", "Pac-12 / West", "Group of 5"];
const ROWS = ["Won a National Title", "Had a Heisman winner", "Plays in a dome", "Animal mascot", "Founded before 1875", "Orange or purple colors"];

function pick3(pool, seed) {
  const a = pool.slice(); let s = (seed >>> 0) || 1;
  const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, 3);
}
const todayNum = () => Math.floor(Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) + "T00:00:00Z") / 86400000);

function wrap(ctx, text, max) {
  const words = text.split(" "); const lines = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
function render(day) {
  const cols = pick3(COLS, day * 7 + 1), rows = pick3(ROWS, day * 13 + 5);
  const W = 720, H = 804, m = 180, cell = (W - m) / 3;
  const c = createCanvas(W, H); const x = c.getContext("2d");
  x.fillStyle = "#0f1117"; x.fillRect(0, 0, W, H);
  x.textAlign = "center"; x.textBaseline = "middle";
  // header band
  x.fillStyle = "#d21e1e"; x.fillRect(0, 0, W, 56);
  x.fillStyle = "#ffffff"; x.font = "bold 26px sans-serif"; x.fillText("🏈 CFB ULTIMATE GRID", W / 2, 28);
  const top = 72;
  // column headers
  x.font = "bold 19px sans-serif";
  for (let i = 0; i < 3; i++) {
    const cx = m + cell * i + cell / 2;
    x.fillStyle = "#1b2030"; x.fillRect(m + cell * i + 4, top + 4, cell - 8, m - 8);
    x.fillStyle = "#ffd21e";
    wrap(x, cols[i], cell - 24).forEach((ln, k, arr) => x.fillText(ln, cx, top + m / 2 - (arr.length - 1) * 13 + k * 26));
  }
  // row headers
  for (let j = 0; j < 3; j++) {
    const cy = top + m + cell * j + cell / 2;
    x.fillStyle = "#1b2030"; x.fillRect(4, top + m + cell * j + 4, m - 8, cell - 8);
    x.fillStyle = "#ffd21e";
    wrap(x, rows[j], m - 24).forEach((ln, k, arr) => x.fillText(ln, m / 2, cy - (arr.length - 1) * 13 + k * 26));
  }
  // grid cells
  x.font = "bold 54px sans-serif";
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const gx = m + cell * i, gy = top + m + cell * j;
    x.fillStyle = "#161a26"; x.fillRect(gx + 4, gy + 4, cell - 8, cell - 8);
    x.strokeStyle = "#2a3142"; x.lineWidth = 2; x.strokeRect(gx + 4, gy + 4, cell - 8, cell - 8);
    x.fillStyle = "#39435c"; x.fillText("?", gx + cell / 2, gy + cell / 2);
  }
  return c.toBuffer("image/png");
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  try {
    if (url.searchParams.get("img") === "1") {
      const day = Number(url.searchParams.get("d")) || todayNum();
      const png = render(day);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.status(200).send(png); return;
    }
    if (!GAMES_SECRET || url.searchParams.get("key") !== GAMES_SECRET) { res.status(401).json({ error: "bad key" }); return; }
    const day = todayNum();
    const content =
      `🎯 **CFB Ultimate Grid** — daily puzzle!\n` +
      `Name a school for each cell that fits **both** its row and column. Rarer picks score more 🏆 — post your 9 answers below and compare!`;
    const embeds = [{ image: { url: `${BASE}/api/games/grid?img=1&d=${day}` }, color: 13770518 }];
    const r = await fetch(`${API}/channels/${CHANNEL_ID}/messages`, { method: "POST", headers: HJ, body: JSON.stringify({ content, embeds }) });
    res.status(200).json({ ok: r.ok, status: r.status });
  } catch (e) { res.status(500).json({ error: String(e) }); }
}
