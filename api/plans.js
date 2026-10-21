const { db } = require("./_lib/supabase");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  try {
    const plans = await db("iu_plans?select=slug,display_name,required_links&is_active=eq.true&order=required_links.asc");
    return res.status(200).json({ plans: plans || [] });
  } catch { return res.status(503).json({ error: "Plans are temporarily unavailable." }); }
};
