const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function db(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Server database configuration is missing.");
  const response = await fetch(new URL("/rest/v1/" + path, SUPABASE_URL), {
    ...options,
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error("Database request failed.");
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
module.exports = { db };
