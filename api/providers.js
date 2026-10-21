const { db } = require("./_lib/supabase");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  try {
    const rows = await db("iu_settings?select=key,value&key=in.(provider_workink_enabled,provider_cuty_enabled)");
    const settings = Object.fromEntries((rows || []).map(row => [row.key, row.value]));
    const workinkConfigured = Boolean(process.env.WORKINK_KEY_LINK_URL && process.env.WORKINK_API_KEY);
    // Fail closed: Cuty.io link creation is not completion verification. Do not offer it until
    // an account-supported server-side verification contract is implemented and tested.
    return res.status(200).json({
      providers: {
        workink: settings.provider_workink_enabled === true && workinkConfigured,
        cuty: false
      },
      availability: {
        workink: settings.provider_workink_enabled === true && workinkConfigured ? "available" : "unavailable",
        cuty: "verification-not-ready"
      }
    });
  } catch {
    return res.status(503).json({ error: "Access providers are temporarily unavailable." });
  }
};
