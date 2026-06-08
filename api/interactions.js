import nacl from "tweetnacl";

export const config = { api: { bodyParser: false } };

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
// Channel the advance tracker posts to (defaults to #advance-tracker).
const ADVANCE_CHANNEL_ID = process.env.ADVANCE_CHANNEL_ID || "1512576539181449316";
// Only auto-advance once at least this many coaches are registered (guards setup).
const MIN_COACHES_FOR_AUTO = 2;

const DISCORD = "https://discord.com/api/v10";

// ---------- low-level helpers ----------
async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}
const sb = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
const reply = (res, data) => res.status(200).json({ type: 4, data });
const ephemeral = (res, data) => res.status(200).json({ type: 4, data: { flags: 64, ...data } });
const userOf = (b) => b.member?.user || b.user || {};
const botHeaders = { Authorization: `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" };
const postChannel = (channelId, payload) =>
  fetch(`${DISCORD}/channels/${channelId}/messages`, { method: "POST", headers: botHeaders, body: JSON.stringify(payload) });

// commissioner = server admin OR member with a role named "Commissioner"
async function isCommish(body) {
  try {
    const perms = BigInt(body.member?.permissions || "0");
    if (perms & 8n) return true; // ADMINISTRATOR
    const roles = body.member?.roles || [];
    if (!roles.length) return false;
    const r = await fetch(`${DISCORD}/guilds/${GUILD_ID}/roles`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
    if (!r.ok) return false;
    const all = await r.json();
    const commish = new Set(all.filter((x) => (x.name || "").toLowerCase() === "commissioner").map((x) => x.id));
    return roles.some((rid) => commish.has(rid));
  } catch { return false; }
}

// ---------- league data ----------
async function getLeague() {
  const r = await sb("dyn_league?id=eq.1&select=season,current_week");
  const rows = r.ok ? await r.json() : [];
  return rows[0] || { season: 2027, current_week: 1 };
}
async function activeCoaches() {
  const r = await sb("dyn_coaches?active=eq.true&select=user_id,username,team");
  return r.ok ? await r.json() : [];
}
async function advancesFor(season, week) {
  const r = await sb(`dyn_advances?season=eq.${season}&week=eq.${week}&select=user_id,username`);
  return r.ok ? await r.json() : [];
}
async function setWeek(week) {
  await sb("dyn_league?id=eq.1", { method: "PATCH", body: JSON.stringify({ current_week: week, updated_at: new Date().toISOString() }) });
}

// ---------- slash commands ----------
async function cmdDone(res, body) {
  const u = userOf(body);
  const username = u.global_name || u.username || "coach";
  const lg = await getLeague();

  // make sure the caller is on the roster (don't clobber an existing team)
  await sb("dyn_coaches?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ user_id: u.id, username, active: true }),
  });

  const ins = await sb("dyn_advances", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ season: lg.season, week: lg.current_week, user_id: u.id, username }),
  });
  if (ins.status === 409) return ephemeral(res, { content: `You've already advanced **Week ${lg.current_week}**. ✅` });
  if (!ins.ok) return ephemeral(res, { content: "Couldn't record that — try again." });

  const coaches = await activeCoaches();
  const done = await advancesFor(lg.season, lg.current_week);
  const total = coaches.length || done.length;
  const doneCount = done.length;

  if (total >= MIN_COACHES_FOR_AUTO && doneCount >= total) {
    const list = done.map((d) => d.username || "coach").join(", ");
    const next = lg.current_week + 1;
    await postChannel(ADVANCE_CHANNEL_ID, {
      content: `🏁 **Week ${lg.current_week} complete!** All ${total} coaches are in (${list}).\n⏭️ The league is now on **Week ${next}** — play your games and run \`/done\`. Good luck. 🏈`,
    });
    await setWeek(next);
    return reply(res, { content: `✅ You were the last one in — **Week ${lg.current_week} is done!** League advanced to **Week ${next}**. 🎉` });
  }

  return reply(res, { content: `✅ **${username}** advanced **Week ${lg.current_week}** — ${doneCount}/${total} in.` });
}

async function cmdStatus(res, body) {
  const lg = await getLeague();
  const coaches = await activeCoaches();
  const done = await advancesFor(lg.season, lg.current_week);
  const doneIds = new Set(done.map((d) => d.user_id));
  const doneList = done.map((d) => `✅ ${d.username || "coach"}`);
  const pending = coaches.filter((c) => !doneIds.has(c.user_id)).map((c) => `⏳ ${c.username || c.user_id}`);
  const total = coaches.length || done.length;
  const lines = [...doneList, ...pending].join("\n") || "_No coaches registered yet — pick a team or run `/done`._";
  return reply(res, { content: `📋 **Week ${lg.current_week}** — ${done.length}/${total} advanced\n${lines}` });
}

async function cmdAdvance(res, body) {
  if (!(await isCommish(body))) return ephemeral(res, { content: "🔒 Only commissioners can advance the league." });
  const lg = await getLeague();
  const next = lg.current_week + 1;
  await setWeek(next);
  await postChannel(ADVANCE_CHANNEL_ID, {
    content: `⏭️ A commissioner advanced the league to **Week ${next}**. Play your games and run \`/done\`.`,
  });
  return ephemeral(res, { content: `Advanced to **Week ${next}**.` });
}

async function cmdWeek(res, body) {
  if (!(await isCommish(body))) return ephemeral(res, { content: "🔒 Commissioners only." });
  const opt = (body.data.options || []).find((o) => o.name === "number");
  const wk = opt ? Number(opt.value) : null;
  if (!wk || wk < 1) return ephemeral(res, { content: "Provide a valid week number." });
  await setWeek(wk);
  return ephemeral(res, { content: `Set current week to **${wk}**.` });
}

async function cmdMyteam(res, body) {
  const u = userOf(body);
  const r = await sb(`dyn_coaches?user_id=eq.${u.id}&select=team`);
  const rows = r.ok ? await r.json() : [];
  const team = rows[0]?.team;
  return ephemeral(res, { content: team ? `Your team: **${team}**` : "You haven't picked a team yet — use the dropdowns in the team-picker channel." });
}

// ---------- team picker (select menu) ----------
async function handleTeamPick(res, body) {
  try {
    const userId = body.member?.user?.id;
    const username = body.member?.user?.global_name || body.member?.user?.username;
    const have = new Set(body.member?.roles || []);
    const values = body.data?.values || [];
    const labelFor = (val) => {
      for (const row of body.message?.components || [])
        for (const c of row.components || [])
          if (c.type === 3) for (const o of c.options || []) if (o.value === val) return o.label;
      return null;
    };
    for (const roleId of values) {
      const had = have.has(roleId);
      await fetch(`${DISCORD}/guilds/${GUILD_ID}/members/${userId}/roles/${roleId}`, {
        method: had ? "DELETE" : "PUT",
        headers: { Authorization: `Bot ${BOT_TOKEN}`, "X-Audit-Log-Reason": "Team picker" },
      });
      if (!had) {
        await sb("dyn_coaches?on_conflict=user_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ user_id: userId, username, team: labelFor(roleId) || roleId, active: true }),
        });
      }
    }
  } catch { /* fall through to a safe update */ }
  return res.status(200).json({ type: 7, data: { content: body.message.content, components: body.message.components } });
}

// ---------- entrypoint ----------
export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
  const sig = req.headers["x-signature-ed25519"];
  const ts = req.headers["x-signature-timestamp"];
  const raw = await readRaw(req);
  let valid = false;
  try {
    valid = sig && ts && PUBLIC_KEY && nacl.sign.detached.verify(Buffer.from(ts + raw), Buffer.from(sig, "hex"), Buffer.from(PUBLIC_KEY, "hex"));
  } catch { valid = false; }
  if (!valid) { res.status(401).send("invalid request signature"); return; }

  const body = JSON.parse(raw);

  // PING
  if (body.type === 1) { res.status(200).json({ type: 1 }); return; }

  // slash commands
  if (body.type === 2) {
    const name = body.data?.name;
    try {
      if (name === "done") return await cmdDone(res, body);
      if (name === "status") return await cmdStatus(res, body);
      if (name === "advance") return await cmdAdvance(res, body);
      if (name === "week") return await cmdWeek(res, body);
      if (name === "myteam") return await cmdMyteam(res, body);
    } catch (e) {
      return ephemeral(res, { content: "Something went wrong: " + String(e).slice(0, 150) });
    }
    return ephemeral(res, { content: "Unknown command." });
  }

  // components (team picker select menu)
  if (body.type === 3) {
    return await handleTeamPick(res, body);
  }

  res.status(200).json({ type: 4, data: { flags: 64, content: "Unsupported interaction." } });
}
