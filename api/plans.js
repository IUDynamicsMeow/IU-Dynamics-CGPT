const { db } = require("./_lib/supabase");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  try {
    const plans = await db("iu_plans?select=id,slug,display_name,required_links&is_active=eq.true&order=required_links.asc");
    const withStock = await Promise.all((plans || []).map(async plan => {
      const available = await db("iu_accounts?select=id&plan_id=eq." + encodeURIComponent(plan.id) + "&status=eq.available&limit=1");
      return { slug: plan.slug, display_name: plan.display_name, required_links: plan.required_links, in_stock: Array.isArray(available) && available.length > 0 };
    }));
    return res.status(200).json({ plans: withStock });
  } catch { return res.status(503).json({ error: "Plans or account stock are temporarily unavailable." }); }
};
