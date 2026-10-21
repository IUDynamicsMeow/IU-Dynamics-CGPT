const crypto = require("node:crypto");
const { db } = require("../_lib/supabase");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).send("Method not allowed.");
  const sessionToken = typeof req.query?.session === "string" ? req.query.session : "";
  const attemptId = typeof req.query?.attempt === "string" ? req.query.attempt : "";
  const token = typeof req.query?.token === "string" ? req.query.token : "";
  const home = process.env.APP_URL || "https://iu-dynamics.vercel.app";
  if (!sessionToken || !attemptId || !token || sessionToken.length < 40 || sessionToken.length > 100)
    return res.redirect(302, home + "/?unlock=not-verified");
  try {
    const hash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    const sessions = await db("iu_unlock_sessions?select=id,provider,required_links,status,expires_at&session_token_hash=eq." + hash + "&limit=1");
    const session = sessions?.[0];
    if (!session || session.provider !== "workink" || session.status !== "in_progress" || new Date(session.expires_at) <= new Date())
      return res.redirect(302, home + "/?unlock=session-expired");
    const attempts = await db("iu_link_attempts?select=id,status&session_id=eq." + session.id + "&id=eq." + encodeURIComponent(attemptId) + "&provider=eq.workink&limit=1");
    if (!attempts?.length || attempts[0].status === "verified")
      return res.redirect(302, home + "/?unlock=not-verified");
    // Work.ink's documented Key System endpoint is /token/isValid/{token}.
    // deleteToken=1 makes each completion token single-use.
    const verify = await fetch("https://work.ink/_api/v2/token/isValid/" + encodeURIComponent(token) + "?deleteToken=1");
    if (!verify.ok) return res.redirect(302, home + "/?unlock=not-verified");
    const verification = await verify.json();
    if (verification?.valid !== true) return res.redirect(302, home + "/?unlock=not-verified");
    const updated = await db("iu_link_attempts?id=eq." + encodeURIComponent(attemptId) + "&status=eq.created&select=id", {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "verified", verified_at: new Date().toISOString() })
    });
    if (!updated?.length) return res.redirect(302, home + "/?unlock=not-verified");
    const verified = await db("iu_link_attempts?select=id&session_id=eq." + session.id + "&status=eq.verified");
    const ready = (verified?.length || 0) >= session.required_links;
    if (ready) {
      await db("iu_unlock_sessions?id=eq." + session.id + "&status=eq.in_progress", {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "unlocked", unlocked_at: new Date().toISOString() })
      });
    }
    return res.redirect(302, home + "/?unlock=" + (ready ? "ready" : "progress"));
  } catch { return res.redirect(302, home + "/?unlock=verification-error"); }
};
