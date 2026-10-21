const { db, parseBody, requireAdmin, audit, fail } = require("../_lib/admin");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  let admin;
  try {
    admin = await requireAdmin(req);
    if (req.method === "GET") {
      const [settings, plans, audits] = await Promise.all([
        db("iu_settings?select=key,value,updated_at&order=key"),
        db("iu_plans?select=id,slug,display_name,required_links,is_active,updated_at&order=required_links.asc"),
        db("iu_admin_audit?select=actor_email,action,target_type,target_id,details,created_at&order=created_at.desc&limit=20")
      ]);
      const values = Object.fromEntries((settings || []).map(s => [s.key, s.value]));
      return res.status(200).json({
        providers: { cuty: values.provider_cuty_enabled === true, workink: values.provider_workink_enabled === true },
        plans: plans || [],
        audit: audits || []
      });
    }
    if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed." });
    const body = parseBody(req);
    if (body.providers && typeof body.providers === "object") {
      for (const provider of ["cuty", "workink"]) {
        if (typeof body.providers[provider] !== "boolean") continue;
        const key = "provider_" + provider + "_enabled";
        await db("iu_settings?on_conflict=key", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify([{ key, value: body.providers[provider], updated_at: new Date().toISOString(), updated_by: admin.email }])
        });
        await audit(admin.email, "provider_setting_changed", "provider", provider, { enabled: body.providers[provider] });
      }
    }
    if (Array.isArray(body.plans)) {
      if (body.plans.length > 4) return res.status(400).json({ error: "Too many plan updates." });
      const seen = new Set();
      for (const p of body.plans) {
        if (!p || !["super_basic", "basic", "epic", "ultimate"].includes(p.slug) || seen.has(p.slug)) {
          return res.status(400).json({ error: "A plan update was invalid." });
        }
        seen.add(p.slug);
        const changes = {};
        if (p.required_links !== undefined) {
          if (!Number.isInteger(p.required_links) || p.required_links < 1 || p.required_links > 50)
            return res.status(400).json({ error: "Link requirements must be a whole number from 1 to 50." });
          changes.required_links = p.required_links;
        }
        if (p.is_active !== undefined) {
          if (typeof p.is_active !== "boolean") return res.status(400).json({ error: "Plan availability must be true or false." });
          changes.is_active = p.is_active;
        }
        if (Object.keys(changes).length) {
          changes.updated_at = new Date().toISOString();
          await db("iu_plans?slug=eq." + encodeURIComponent(p.slug), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(changes)
          });
          await audit(admin.email, "plan_updated", "plan", p.slug, changes);
        }
      }
    }
    return res.status(200).json({ ok: true });
  } catch (error) { return fail(res, error); }
};
