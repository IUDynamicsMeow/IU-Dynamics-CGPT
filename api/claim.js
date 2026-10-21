const crypto = require("node:crypto");
const { db } = require("./_lib/supabase");
function cookieValue(req, name) {
  const raw = req.headers?.cookie || "";
  const pair = raw.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : "";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const sessionToken = cookieValue(req, "iu_session");
  if (sessionToken.length < 40 || sessionToken.length > 100)
    return res.status(400).json({ error: "Your access session is invalid. Start again." });
  try {
    const hash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    const result = await db("rpc/claim_iu_license_key", {
      method: "POST",
      body: JSON.stringify({ p_session_token_hash: hash })
    });
    const claim = Array.isArray(result) ? result[0] : null;
    if (!claim?.key_value) return res.status(409).json({ error: "No key is available for this session, or it has already been claimed. Contact support if you think this is a mistake." });
    res.setHeader("Set-Cookie", "iu_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
    return res.status(200).json({ key: claim.key_value, plan: claim.plan_slug });
  } catch {
    return res.status(503).json({ error: "Key claiming is temporarily unavailable. No key was released." });
  }
};
