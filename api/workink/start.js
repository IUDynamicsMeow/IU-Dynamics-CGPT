const crypto = require("node:crypto");
const { db } = require("../_lib/supabase");
const { allowRequest } = require("../_lib/rate-limit");
function cookieValue(req, name) {
  const raw = req.headers?.cookie || "";
  const pair = raw.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : "";
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const baseLink = process.env.WORKINK_KEY_LINK_URL, apiKey = process.env.WORKINK_API_KEY;
  if (!baseLink || !apiKey) return res.status(503).json({ error: "The link provider is not configured." });
  try {
    if (!(await allowRequest(req, "workink-start", 20))) return res.status(429).json({ error: "Too many link requests. Please wait a few minutes and try again." });
    const sessionToken = cookieValue(req, "iu_session");
    if (sessionToken.length < 40 || sessionToken.length > 100)
      return res.status(400).json({ error: "Your access session is missing. Please start again." });
    const hash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    const sessions = await db("iu_unlock_sessions?select=id,provider,required_links,status,expires_at&session_token_hash=eq." + hash + "&limit=1");
    const session = sessions?.[0];
    if (!session || session.provider !== "workink" || session.status !== "in_progress" || new Date(session.expires_at) <= new Date())
      return res.status(400).json({ error: "This access session has expired or uses an unavailable provider. Start again." });
    const settings = await db("iu_settings?select=value&key=eq.provider_workink_enabled&limit=1");
    if (!settings?.length || settings[0].value !== true) return res.status(503).json({ error: "Work.ink is temporarily disabled." });
    const attemptId = crypto.randomUUID();
    const appUrl = process.env.APP_URL || (process.env.VERCEL_ENV === "production" ? "https://iu-dynamics.vercel.app" : process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://iu-dynamics.vercel.app");
    const destination = new URL("/api/workink/return", appUrl);
    destination.searchParams.set("attempt", attemptId);
    destination.searchParams.set("token", "{TOKEN}");
    const overrideUrl = new URL("https://work.ink/_api/v2/override");
    overrideUrl.searchParams.set("destination", destination.toString());
    const overrideResponse = await fetch(overrideUrl, { headers: { "X-Api-Key": apiKey } });
    if (!overrideResponse.ok) throw new Error("Could not prepare link override.");
    const override = await overrideResponse.json();
    if (!override?.sr) throw new Error("No override token returned.");
    const link = new URL(baseLink); link.searchParams.set("sr", override.sr);
    await db("iu_link_attempts", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{ id: attemptId, session_id: session.id, provider: "workink",
        provider_reference: attemptId, short_url: link.toString(), status: "created",
        verification_method: "workink_token_api" }]) });
    return res.status(200).json({ url: link.toString() });
  } catch { return res.status(503).json({ error: "Could not create the provider link. Please try again later." }); }
};
