// Read-only audit endpoint: dumps the server's roles, channels, and permission overrides.
// Visit:  /api/audit?key=YOUR_SETUP_SECRET

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SETUP_SECRET = process.env.SETUP_SECRET;
const DISCORD = "https://discord.com/api/v10";
const H = { Authorization: `Bot ${BOT_TOKEN}` };

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  if (!SETUP_SECRET || url.searchParams.get("key") !== SETUP_SECRET) { res.status(401).json({ error: "bad key" }); return; }
  try {
    const [rolesR, chR, gR] = await Promise.all([
      fetch(`${DISCORD}/guilds/${GUILD_ID}/roles`, { headers: H }),
      fetch(`${DISCORD}/guilds/${GUILD_ID}/channels`, { headers: H }),
      fetch(`${DISCORD}/guilds/${GUILD_ID}?with_counts=true`, { headers: H }),
    ]);
    if (!rolesR.ok || !chR.ok) { res.status(500).json({ error: "fetch failed", roles: rolesR.status, channels: chR.status }); return; }
    const roles = await rolesR.json();
    const channels = await chR.json();
    const guild = gR.ok ? await gR.json() : {};
    const roleName = {}; roles.forEach((r) => (roleName[r.id] = r.name));
    const trimRoles = roles
      .map((r) => ({ id: r.id, name: r.name, permissions: r.permissions, position: r.position, color: r.color, managed: r.managed, mentionable: r.mentionable, hoist: r.hoist }))
      .sort((a, b) => b.position - a.position);
    const trimCh = channels
      .map((c) => ({
        id: c.id, name: c.name, type: c.type, parent_id: c.parent_id, position: c.position,
        overwrites: (c.permission_overwrites || []).map((o) => ({ id: o.id, kind: o.type === 0 ? "role" : "member", name: o.type === 0 ? (roleName[o.id] || o.id) : o.id, allow: o.allow, deny: o.deny })),
      }))
      .sort((a, b) => (a.parent_id || "").localeCompare(b.parent_id || "") || a.position - b.position);
    res.status(200).json({
      guild: { name: guild.name, owner_id: guild.owner_id, members: guild.approximate_member_count, online: guild.approximate_presence_count, mfa_level: guild.mfa_level, verification_level: guild.verification_level },
      role_count: roles.length,
      roles: trimRoles,
      channels: trimCh,
    });
  } catch (e) {
    res.status(500).json({ error: String(e).slice(0, 200) });
  }
}
