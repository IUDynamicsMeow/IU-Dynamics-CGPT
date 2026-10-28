const crypto = require("node:crypto");
const { db } = require("../_lib/supabase");
const { allowRequest } = require("../_lib/rate-limit");
function cookieValue(req, name) {
  const raw = req.headers?.cookie || "";
  const pair = raw.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : "";
}
function appUrl() {
  return process.env.APP_URL || (process.env.VERCEL_ENV === "production" ? "https://iu-dynamics.vercel.app" : process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://iu-dynamics.vercel.app");
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const cutyToken = process.env.CUTY_API_KEY || process.env.CUTI_API_KEY;
  if (!cutyToken) return res.status(503).json({ error: "Cuty.io Quick Link is not configured." });
  try {
    if (!(await allowRequest(req, "cuty-start", 20))) return res.status(429).json({ error: "Too many link requests. Please wait a few minutes and try again." });
    const sessionToken = cookieValue(req, "iu_session");
    if (sessionToken.length < 40 || sessionToken.length > 100) return res.status(400).json({ error: "Your access session is missing. Please start again." });
    const hash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    const sessions = await db("iu_unlock_sessions?select=id,plan_id,provider,required_links,status,expires_at&session_token_hash=eq." + hash + "&limit=1");
    const session = sessions?.[0];
    if (!session || session.provider !== "cuty" || session.status !== "in_progress" || new Date(session.expires_at) <= new Date())
      return res.status(400).json({ error: "This access session has expired or uses an unavailable provider. Start again." });
    const settings = await db("iu_settings?select=value&key=eq.provider_cuty_enabled&limit=1");
    if (!settings?.length || settings[0].value !== true) return res.status(503).json({ error: "Cuty.io is temporarily disabled." });
    const stock = await db("iu_accounts?select=id&plan_id=eq." + encodeURIComponent(session.plan_id) + "&status=eq.available&limit=1");
    if (!stock?.length) return res.status(409).json({ error: "This account category has run out of stock. Please choose another plan or check back later." });
    const completed = await db("iu_link_attempts?select=id&session_id=eq." + encodeURIComponent(session.id) + "&provider=eq.cuty&status=eq.verified");
    if ((completed?.length || 0) >= session.required_links) {
      await db("iu_unlock_sessions?id=eq." + encodeURIComponent(session.id) + "&status=eq.in_progress", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "unlocked", unlocked_at: new Date().toISOString() }) });
      return res.status(409).json({ error: "All required Cuty.io steps are already complete. Return to the site to claim your account." });
    }
    const attemptId = crypto.randomUUID();
    const oneTimeToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(oneTimeToken).digest("hex");
    const destination = new URL("/api/cuty/return", appUrl());
    destination.searchParams.set("attempt", attemptId);
    destination.searchParams.set("token", oneTimeToken);
    const link = new URL("https://cuty.io/quick");
    link.searchParams.set("token", cutyToken);
    link.searchParams.set("url", destination.toString());
    await db("iu_link_attempts", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{
      id: attemptId, session_id: session.id, provider: "cuty", provider_reference: tokenHash,
      short_url: link.toString(), status: "created", verification_method: "cuty_quick_link_return"
    }]) });
    return res.status(200).json({ url: link.toString() });
  } catch {
    return res.status(503).json({ error: "Could not create the Cuty.io link. Please try again later." });
  }
};
