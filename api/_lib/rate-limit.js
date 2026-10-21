const crypto = require("node:crypto");
const { db } = require("./supabase");

async function allowRequest(req, scope, limit, windowSeconds = 600, identity = null) {
  const headers = req.headers || {};
  const forwarded = typeof headers["x-forwarded-for"] === "string"
    ? headers["x-forwarded-for"].split(",")[0].trim()
    : "";
  const identityValue = identity || headers["x-real-ip"] || forwarded || "unknown";
  const pepper = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!pepper || !identityValue) throw new Error("Rate limiting is not configured.");
  const keyHash = crypto.createHash("sha256")
    .update(scope + "\0" + String(identityValue) + "\0" + pepper)
    .digest("hex");
  const result = await db("rpc/consume_iu_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      p_key_hash: keyHash,
      p_window_seconds: windowSeconds,
      p_max_requests: limit
    })
  });
  if (typeof result !== "boolean") throw new Error("Rate limit service returned an invalid response.");
  return result;
}

module.exports = { allowRequest };
