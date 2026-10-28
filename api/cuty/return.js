const crypto = require("node:crypto");
const { db } = require("../_lib/supabase");
function appUrl() {
  return process.env.APP_URL || (process.env.VERCEL_ENV === "production" ? "https://iu-dynamics.vercel.app" : process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://iu-dynamics.vercel.app");
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "GET") return res.status(405).send("Method not allowed.");
  const attemptId = typeof req.query?.attempt === "string" ? req.query.attempt : "";
  const token = typeof req.query?.token === "string" ? req.query.token : "";
  const home = appUrl();
  const reject = (code = "not-verified") => res.redirect(302, home + "/?unlock=" + code + "&provider=cuty");
  if (!/^[0-9a-f-]{36}$/i.test(attemptId) || token.length < 40 || token.length > 100) return reject();
  try {
    const attempts = await db("iu_link_attempts?select=id,session_id,provider_reference,status&provider=eq.cuty&id=eq." + encodeURIComponent(attemptId) + "&limit=1");
    const attempt = attempts?.[0];
    if (!attempt || attempt.status !== "created") return reject();
    const expectedHash = Buffer.from(attempt.provider_reference || "", "hex");
    const actualHash = Buffer.from(crypto.createHash("sha256").update(token).digest("hex"), "hex");
    if (expectedHash.length !== actualHash.length || !crypto.timingSafeEqual(expectedHash, actualHash)) return reject();
    const sessions = await db("iu_unlock_sessions?select=id,provider,required_links,status,expires_at&id=eq." + encodeURIComponent(attempt.session_id) + "&limit=1");
    const session = sessions?.[0];
    if (!session || session.provider !== "cuty" || session.status !== "in_progress" || new Date(session.expires_at) <= new Date()) return reject("session-expired");
    const updated = await db("iu_link_attempts?id=eq." + encodeURIComponent(attemptId) + "&provider=eq.cuty&status=eq.created&provider_reference=eq." + encodeURIComponent(attempt.provider_reference) + "&select=id", {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "verified", verified_at: new Date().toISOString() })
    });
    if (!updated?.length) return reject();
    const verified = await db("iu_link_attempts?select=id&session_id=eq." + encodeURIComponent(session.id) + "&provider=eq.cuty&status=eq.verified");
    const ready = (verified?.length || 0) >= session.required_links;
    if (ready) await db("iu_unlock_sessions?id=eq." + encodeURIComponent(session.id) + "&status=eq.in_progress", {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "unlocked", unlocked_at: new Date().toISOString() })
    });
    return res.redirect(302, home + "/?unlock=" + (ready ? "ready" : "progress") + "&provider=cuty");
  } catch {
    return res.redirect(302, home + "/?unlock=verification-error&provider=cuty");
  }
};
