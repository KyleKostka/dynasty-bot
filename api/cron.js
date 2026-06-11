// Scheduled job: game reminders (timed) + daily nudge for coaches who still owe their game.
// Hit on a schedule by a GitHub Action: /api/cron?key=YOUR_SETUP_SECRET

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const SETUP_SECRET = process.env.SETUP_SECRET;
const ADVANCE_CHANNEL_ID = process.env.ADVANCE_CHANNEL_ID || "1512576539181449316";
const LEAGUE_CHAT_ID = process.env.LEAGUE_CHAT_ID || "1257724499562856552";
const DISCORD = "https://discord.com/api/v10";

const sb = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
const post = (channelId, payload) =>
  fetch(`${DISCORD}/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

// Reminders: ping both coaches ~30 min before a locked game (once).
async function doReminders(out) {
  const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // skip games >2h past
  const r = await sb(`dyn_games?status=eq.locked&reminded=is.false&game_time=not.is.null&game_time=lte.${soon}&game_time=gte.${cutoff}&select=*`);
  const games = r.ok ? await r.json() : [];
  for (const g of games) {
    await post(LEAGUE_CHAT_ID, {
      content: `⏰ **Game reminder** — <@${g.proposer_id}> vs <@${g.opponent_id}>, you're on for **${g.chosen}**. Good luck! 🏈`,
      allowed_mentions: { users: [g.proposer_id, g.opponent_id] },
    });
    await sb(`dyn_games?id=eq.${g.id}`, { method: "PATCH", body: JSON.stringify({ reminded: true }) });
    out.reminders++;
  }
}

// Nudge: once per day, ping the coaches who still owe their current-stage game (once at least one is in).
async function doNudge(out) {
  const lg = ((await (await sb("dyn_league?id=eq.1&select=season,current_week")).json()) || [])[0];
  if (!lg) return;
  const board = ((await (await sb("dyn_board?id=eq.1&select=message_id,last_nudge")).json()) || [])[0];
  if (!board || !board.message_id) return; // no live board → nothing to nudge toward
  const today = new Date().toISOString().slice(0, 10);
  if (board.last_nudge === today) return; // already nudged today
  const coaches = (await (await sb("dyn_coaches?active=eq.true&select=user_id,username,away")).json()) || [];
  const done = new Set(((await (await sb(`dyn_advances?season=eq.${lg.season}&week=eq.${lg.current_week}&select=user_id`)).json()) || []).map((x) => x.user_id));
  if (done.size < 1) return; // don't nudge before anyone has checked in
  const pending = coaches.filter((c) => !c.away && !done.has(c.user_id));
  if (!pending.length) return; // everyone's in
  const mentions = pending.map((c) => `<@${c.user_id}>`).join(" ");
  await post(ADVANCE_CHANNEL_ID, {
    content: `⏰ Last call — still waiting on ${mentions} to check in. Play your game and tap ✅ on the board. 🏈`,
    allowed_mentions: { users: pending.map((c) => c.user_id) },
  });
  await sb("dyn_board?id=eq.1", { method: "PATCH", body: JSON.stringify({ last_nudge: today }) });
  out.nudged = pending.length;
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  if (!SETUP_SECRET || url.searchParams.get("key") !== SETUP_SECRET) {
    res.status(401).json({ error: "bad key" });
    return;
  }
  const out = { reminders: 0, nudged: 0 };
  try { await doReminders(out); } catch (e) { out.reminderError = String(e).slice(0, 150); }
  try { await doNudge(out); } catch (e) { out.nudgeError = String(e).slice(0, 150); }
  res.status(200).json({ ok: true, ...out });
}
