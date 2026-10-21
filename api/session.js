const crypto = require("node:crypto");
const { db } = require("./_lib/supabase");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  try {
    const slug = typeof req.body?.plan === "string" ? req.body.plan : "";
    const provider = typeof req.body?.provider === "string" ? req.body.provider : "workink";
    if (!/^[a-z0-9_-]{2,40}$/.test(slug)) return res.status(400).json({ error: "Choose a valid plan." });
    if (!["workink", "cuty"].includes(provider)) return res.status(400).json({ error: "Choose a valid link provider." });
    if (provider !== "workink") return res.status(503).json({ error: "Cuty.io completion verification is not ready yet. Please use Work.ink." });
    if (!process.env.WORKINK_KEY_LINK_URL || !process.env.WORKINK_API_KEY)
      return res.status(503).json({ error: "Work.ink is not configured yet." });
    const settings = await db("iu_settings?select=key,value&key=eq.provider_workink_enabled&limit=1");
    if (!settings?.length || settings[0].value !== true)
      return res.status(503).json({ error: "Work.ink is temporarily disabled." });
    const plans = await db("iu_plans?select=id,slug,required_links&slug=eq." + encodeURIComponent(slug) + "&is_active=eq.true&limit=1");
    if (!plans?.length) return res.status(400).json({ error: "That plan is unavailable." });
    const sessionToken = crypto.randomBytes(32).toString("base64url");
    const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await db("iu_unlock_sessions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        plan_id: plans[0].id, session_token_hash: sessionTokenHash,
        required_links: plans[0].required_links, provider, status: "in_progress", expires_at: expiresAt
      }])
    });
    res.setHeader("Set-Cookie", "iu_session=" + sessionToken + "; Path=/; Max-Age=7200; HttpOnly; Secure; SameSite=Lax");
    return res.status(201).json({ expiresAt, requiredLinks: plans[0].required_links, provider });
  } catch {
    return res.status(503).json({ error: "Could not create an access session. Please try again later." });
  }
};
