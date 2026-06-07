// "Who's That Mascot" image renderer.
//   /api/games/silhouette?id=<espnId>        -> blue silhouette on starburst + "?"
//   /api/games/silhouette?id=<espnId>&reveal=1 -> full-color logo on starburst
//   /api/games/silhouette?cover=1            -> Start-wall cover (starburst + big "?")
import { createCanvas, loadImage } from "@napi-rs/canvas";

const LOGO = (id) => `https://a.espncdn.com/i/teamlogos/ncaa/500/${id}.png`;

function drawStarburst(ctx, W, H, cx, cy) {
  ctx.fillStyle = "#d21e1e"; ctx.fillRect(0, 0, W, H);
  const n = 36, R = Math.hypot(W, H);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI, a2 = ((i + 1) / n) * 2 * Math.PI;
    ctx.fillStyle = i % 2 === 0 ? "#c11212" : "#ec3636";
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(a0), cy + R * Math.sin(a0));
    ctx.lineTo(cx + R * Math.cos(a2), cy + R * Math.sin(a2));
    ctx.closePath(); ctx.fill();
  }
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 260);
  g.addColorStop(0, "rgba(255,120,120,0.55)"); g.addColorStop(1, "rgba(255,120,120,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawQuestion(ctx, x, y, s) {
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const draw = (col, w) => {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(x, y, s * 0.55, Math.PI * 0.95, Math.PI * 0.05, false); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.55, y); ctx.quadraticCurveTo(x + s * 0.55, y + s * 0.5, x, y + s * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + s * 1.15, s * 0.16, 0, 2 * Math.PI); ctx.fill();
  };
  draw("#1a1a26", s * 0.42); draw("#ffd21e", s * 0.26);
  ctx.restore();
}

async function render({ id, reveal, cover }) {
  const W = 700, H = 460, cx = W / 2, cy = H * 0.47;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  drawStarburst(ctx, W, H, cx, cy);

  if (cover) {
    drawQuestion(ctx, cx, cy - 40, 95);
    return canvas.toBuffer("image/png");
  }

  let img = null;
  try {
    const buf = Buffer.from(await (await fetch(LOGO(id))).arrayBuffer());
    img = await loadImage(buf);
  } catch { img = null; }

  if (img) {
    const box = 300;
    const r = Math.min(box / img.width, box / img.height);
    const lw = img.width * r, lh = img.height * r;
    const ox = cx - lw / 2, oy = cy - lh / 2;
    if (reveal) {
      ctx.drawImage(img, ox, oy, lw, lh);
    } else {
      const lc = createCanvas(W, H);
      const lcx = lc.getContext("2d");
      lcx.drawImage(img, ox, oy, lw, lh);
      lcx.globalCompositeOperation = "source-in";
      lcx.fillStyle = "#16327d"; lcx.fillRect(0, 0, W, H);
      ctx.drawImage(lc, 0, 0);
      drawQuestion(ctx, W * 0.82, H * 0.18, 40);
    }
  } else {
    drawQuestion(ctx, cx, cy - 40, 95);
  }
  return canvas.toBuffer("image/png");
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id");
    const reveal = url.searchParams.get("reveal") === "1";
    const cover = url.searchParams.get("cover") === "1" || !id;
    const png = await render({ id, reveal, cover });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.status(200).send(png);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
