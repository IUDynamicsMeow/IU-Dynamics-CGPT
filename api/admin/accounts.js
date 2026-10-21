const { db, parseBody, requireAdmin, audit, fail } = require("../_lib/admin");
const allowedPlans = ["super_basic", "basic", "epic", "ultimate"];
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  let admin;
  try {
    admin = await requireAdmin(req);
    if (req.method === "GET") {
      const [accounts, plans] = await Promise.all([
        db("iu_accounts?select=id,plan_id,status,claimed_at,created_at&order=created_at.desc&limit=500"),
        db("iu_plans?select=id,slug,display_name")
      ]);
      const byId = Object.fromEntries((plans || []).map(p => [p.id, p]));
      const inventory = (accounts || []).map(a => ({
        id: a.id, planSlug: byId[a.plan_id]?.slug || "unknown",
        planName: byId[a.plan_id]?.display_name || "Unknown plan",
        status: a.status, claimedAt: a.claimed_at, createdAt: a.created_at
      }));
      const counts = { available: 0, claimed: 0, disabled: 0 };
      for (const account of inventory) if (counts[account.status] !== undefined) counts[account.status]++;
      return res.status(200).json({ accounts: inventory, counts, truncated: (accounts || []).length === 500 });
    }
    if (req.method === "POST") {
      const body = parseBody(req);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!allowedPlans.includes(body.planSlug)) return res.status(400).json({ error: "Choose a valid plan." });
      if (!username || username.length > 200 || /[\\u0000-\\u001f\\u007f]/.test(username))
        return res.status(400).json({ error: "Username is required and must be 200 characters or fewer." });
      if (!password || password.length > 1000 || /[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/.test(password))
        return res.status(400).json({ error: "Password is required and must be 1,000 characters or fewer." });
      const plans = await db("iu_plans?select=id&slug=eq." + encodeURIComponent(body.planSlug) + "&limit=1");
      if (!plans?.length) return res.status(400).json({ error: "That plan does not exist." });
      await db("iu_accounts", { method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify([{ plan_id: plans[0].id, username, password_value: password, status: "available" }]) });
      await audit(admin.email, "account_added", "plan", body.planSlug, { username });
      return res.status(201).json({ ok: true, added: 1 });
    }
    if (req.method === "DELETE") {
      const id = typeof req.query?.id === "string" ? req.query.id : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "Choose a valid account record." });
      const removed = await db("iu_accounts?id=eq." + encodeURIComponent(id) + "&status=eq.available&select=id,username", {
        method: "DELETE", headers: { Prefer: "return=representation" }
      });
      if (!removed?.length) return res.status(409).json({ error: "Only unclaimed accounts can be removed." });
      await audit(admin.email, "unused_account_removed", "account", id, { username: removed[0].username });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    if (error?.code === "23505" || /duplicate key|unique constraint/i.test(error?.message || ""))
      return res.status(409).json({ error: "That username already exists. No account was added." });
    return fail(res, error);
  }
};
