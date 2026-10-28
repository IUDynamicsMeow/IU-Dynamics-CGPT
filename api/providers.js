const { db } = require("./_lib/supabase");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  try {
    const rows = await db("iu_settings?select=key,value&key=in.(provider_workink_enabled,provider_cuty_enabled)");
    const settings = Object.fromEntries((rows || []).map(row => [row.key, row.value]));
    const workinkConfigured = Boolean(process.env.WORKINK_KEY_LINK_URL && process.env.WORKINK_API_KEY);
    const cutyConfigured = Boolean(process.env.CUTY_API_KEY || process.env.CUTI_API_KEY);
    const workinkEnabled = settings.provider_workink_enabled === true && workinkConfigured;
    const cutyEnabled = settings.provider_cuty_enabled === true && cutyConfigured;
    return res.status(200).json({
      providers: { workink: workinkEnabled, cuty: cutyEnabled },
      availability: {
        workink: workinkEnabled ? "available" : "unavailable",
        cuty: cutyEnabled ? "available" : cutyConfigured ? "disabled" : "not-configured"
      }
    });
  } catch {
    return res.status(503).json({ error: "Access providers are temporarily unavailable." });
  }
};
