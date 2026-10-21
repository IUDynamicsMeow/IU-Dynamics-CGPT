const crypto = require("node:crypto");
const { db } = require("../_lib/supabase");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).send("Method not allowed.");
  const apiKey = process.env.WORKINK_API_KEY;
  const sessionToken = typeof req.query?.session === "string" ? req.query.session : "";
  const attemptId = typeof req.query?.attempt === "string" ? req.query.attempt : "";
  const token = typeof req.query?.token === "string" ? req.query.token : "";
  const home = process.env.APP_URL || "https://iu-dynamics.vercel.app";
  if (!apiKey || !sessionToken || !attemptId || !token || sessionToken.length < 40 || sessionToken.length > 100)
    return res.redirect(302, home + "/?unlock=not-verified");
  try {
    const hash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    const sessions = await db("iu_unlock_sessions?select=id,required_links,status,expires_at&session_token_hash=eq." + hash + "&limit=1");
    const session = sessions?.[0];
    if (!session || session.status !== "in_progress" || new Date(session.expires_at) <= new Date())
      return res.redirect(302, home + "/?unlock=session-expired");
    const attempts = await db("iu_link_attempts?select=id,status&session_id=eq." + session.id + "&id=eq." + attemptId + "&provider=eq.workink&limit=1");
    if (!attempts?.length || attempts[0].status === "verified")
      return res.redirect(302, home + "/?unlock=not-verified");
    const verify = await fetch("https://work.ink/_api/v2/token/verify/" + encodeURIComponent(token), {
      headers: { "X-Api-Key": apiKey } });
    if (!verify.ok) return res.redirect(302, home + "/?unlock=not-verified");
    const verification = await verify.json();
    if (verification?.valid !== true) return res.redirect(302, home + "/?unlock=not-verified");
    await db("iu_link_attempts?id=eq." + attemptId, { method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "verified", verified_at: new Date().toISOString() }) });
    const verified = await db("iu_link_attempts?select=id&session_id=eq." + session.id + "&status=eq.verified");
    if ((verified?.length || 0) >= session.required_links) {
      await db("iu_unlock_sessions?id=eq." + session.id, { method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "unlocked", unlocked_at: new Date().toISOString() }) });
    }
    return res.redirect(302, home + "/?unlock=" + ((verified?.length || 0) >= session.required_links ? "ready" : "progress"));
  } catch { return res.redirect(302, home + "/?unlock=verification-error"); }
};
