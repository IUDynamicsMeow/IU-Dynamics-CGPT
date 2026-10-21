const { db, parseBody, requireAdmin, audit, fail } = require("../_lib/admin");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  let admin;
  try {
    admin = await requireAdmin(req);
    if (req.method === "GET") {
      const [keys, plans] = await Promise.all([
        db("iu_license_keys?select=id,plan_id,status,claimed_at,claim_reference,created_at&order=created_at.desc&limit=500"),
        db("iu_plans?select=id,slug,display_name")
      ]);
      const byId = Object.fromEntries((plans || []).map(p => [p.id, p]));
      const inventory = (keys || []).map(k => ({
        id: k.id, planSlug: byId[k.plan_id]?.slug || "unknown",
        planName: byId[k.plan_id]?.display_name || "Unknown plan",
        status: k.status, claimedAt: k.claimed_at, createdAt: k.created_at
      }));
      const counts = { available: 0, claimed: 0, disabled: 0 };
      for (const key of inventory) if (counts[key.status] !== undefined) counts[key.status]++;
      return res.status(200).json({ keys: inventory, counts, truncated: (keys || []).length === 500 });
    }
    if (req.method === "POST") {
      const body = parseBody(req);
      if (!["super_basic", "basic", "epic", "ultimate"].includes(body.planSlug) ||
          !Array.isArray(body.keys) || body.keys.length < 1 || body.keys.length > 200)
        return res.status(400).json({ error: "Choose a plan and provide between 1 and 200 keys." });
      const cleaned = body.keys.map(k => typeof k === "string" ? k.trim() : "");
      if (cleaned.some(k => !k || k.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(k)))
        return res.status(400).json({ error: "One or more keys are empty or contain invalid characters." });
      if (new Set(cleaned).size !== cleaned.length)
        return res.status(400).json({ error: "The pasted list contains duplicate keys." });
      const plans = await db("iu_plans?select=id&slug=eq." + encodeURIComponent(body.planSlug) + "&limit=1");
      if (!plans?.length) return res.status(400).json({ error: "That plan does not exist." });
      await db("iu_license_keys?select=id,status,created_at", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(cleaned.map(key_value => ({ plan_id: plans[0].id, key_value, status: "available" })))
      });
      await audit(admin.email, "keys_added", "plan", body.planSlug, { count: cleaned.length });
      return res.status(201).json({ ok: true, added: cleaned.length });
    }
    if (req.method === "DELETE") {
      const id = typeof req.query?.id === "string" ? req.query.id : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "Choose a valid key record." });
      const removed = await db("iu_license_keys?id=eq." + encodeURIComponent(id) + "&status=eq.available&select=id", {
        method: "DELETE", headers: { Prefer: "return=representation" }
      });
      if (!removed?.length) return res.status(409).json({ error: "Only unused keys can be removed. This key may already be claimed or disabled." });
      await audit(admin.email, "unused_key_removed", "license_key", id, {});
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    if (error?.code === "23505" || /duplicate key|unique constraint/i.test(error?.message || "")) {
      return res.status(409).json({ error: "At least one key already exists. No duplicate key was added." });
    }
    return fail(res, error);
  }
};
