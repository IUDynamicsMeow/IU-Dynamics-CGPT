const crypto = require("node:crypto");
const { db } = require("./_lib/supabase");
const { allowRequest } = require("./_lib/rate-limit");
function cookieValue(req, name) {
  const raw = req.headers?.cookie || "";
  const pair = raw.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : "";
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Pragma", "no-cache");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const sessionToken = cookieValue(req, "iu_session");
  if (sessionToken.length < 40 || sessionToken.length > 100)
    return res.status(400).json({ error: "Your access session is invalid. Start again." });
  try {
    if (!(await allowRequest(req, "account-claim", 5)))
      return res.status(429).json({ error: "Too many claim attempts. Please wait a few minutes and try again." });
    const hash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    const result = await db("rpc/claim_iu_account", {
      method: "POST", body: JSON.stringify({ p_session_token_hash: hash })
    });
    const claim = Array.isArray(result) ? result[0] : null;
    if (!claim?.username || !claim?.password_value)
      return res.status(409).json({ error: "No account is available for this plan, or this session has already been claimed. You can start a new session to claim another available account." });
    res.setHeader("Set-Cookie", "iu_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
    return res.status(200).json({ username: claim.username, password: claim.password_value, plan: claim.plan_slug });
  } catch {
    return res.status(503).json({ error: "Account claiming is temporarily unavailable. No credentials were released." });
  }
};
