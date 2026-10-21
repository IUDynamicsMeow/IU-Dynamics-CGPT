const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function db(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Server database configuration is missing.");
  const response = await fetch(new URL("/rest/v1/" + path, SUPABASE_URL), {
    ...options,
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) {
    let details = {};
    try { details = text ? JSON.parse(text) : {}; } catch {}
    const error = new Error("Database request failed.");
    error.statusCode = response.status;
    error.code = details.code;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}
module.exports = { db };
