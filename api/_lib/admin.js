const { db } = require("./supabase");

function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

async function requireAdmin(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) {
    const error = new Error("Sign in with the administrator account to continue.");
    error.statusCode = 401;
    throw error;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Authentication is not configured.");
  const response = await fetch(new URL("/auth/v1/user", url), {
    headers: { apikey: anonKey, Authorization: "Bearer " + match[1] }
  });
  if (!response.ok) {
    const error = new Error("Your sign-in expired. Sign in again.");
    error.statusCode = 401;
    throw error;
  }
  const user = await response.json();
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (!email) {
    const error = new Error("This account is not authorized.");
    error.statusCode = 403;
    throw error;
  }
  const admins = await db("iu_admins?select=email&email=eq." + encodeURIComponent(email) + "&is_active=eq.true&limit=1");
  if (!admins?.length) {
    const error = new Error("This account is not authorized to manage IU Dynamics.");
    error.statusCode = 403;
    throw error;
  }
  return { email };
}

async function audit(actor, action, targetType, targetId, details = {}) {
  await db("iu_admin_audit", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{
      actor_email: actor,
      action,
      target_type: targetType,
      target_id: targetId == null ? null : String(targetId),
      details
    }])
  });
}

function fail(res, error) {
  const status = [401, 403].includes(error?.statusCode) ? error.statusCode : 500;
  return res.status(status).json({
    error: status === 500 ? "The admin request could not be completed. Please try again." : error.message
  });
}

module.exports = { db, parseBody, requireAdmin, audit, fail };
