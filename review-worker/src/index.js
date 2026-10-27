/* PMR website review API.
 *
 * Stores comments that John (and Derek) leave on sections of the website while
 * in review mode. Every request must carry the shared review key in the
 * X-Review-Key header; the key is a Worker secret (REVIEW_KEY), never in source.
 * While OPEN_REVIEW is "true", the key check is skipped and the origin check
 * is the only gate. Turn it off before the site launches.
 *
 *   GET    /comments              all comments, oldest first
 *   POST   /comments              { page, section, sectionLabel, target?, kind, author, body }
 *   PATCH  /comments/:id          { status: "open" | "resolved" }
 *   DELETE /comments/:id
 */

const MAX_BODY = 5000;
const MAX_SHORT = 200;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!cors["Access-Control-Allow-Origin"] && origin) return json({ error: "origin not allowed" }, 403, cors);
    // OPEN_REVIEW="true" accepts any key while the site is a private draft (see js/review.js).
    const open = env.OPEN_REVIEW === "true";
    if (!open && (!env.REVIEW_KEY || !safeEqual(request.headers.get("X-Review-Key") || "", env.REVIEW_KEY))) {
      return json({ error: "review key required" }, 401, cors);
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/comments(?:\/([\w-]+))?\/?$/);
    if (!match) return json({ error: "not found" }, 404, cors);
    const id = match[1];

    try {
      if (!id && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM comments ORDER BY created_at").all();
        return json({ comments: results.map(toApi) }, 200, cors);
      }

      if (!id && request.method === "POST") {
        const input = await request.json();
        const row = {
          id: crypto.randomUUID(),
          page: short(input.page),
          section: short(input.section),
          section_label: short(input.sectionLabel || input.section),
          target: short(input.target) || null,
          kind: input.kind === "content" ? "content" : "comment",
          author: short(input.author) || "Anonymous",
          body: String(input.body || "").trim().slice(0, MAX_BODY),
          created_at: new Date().toISOString(),
        };
        if (!row.page || !row.section || !row.body) return json({ error: "page, section and body are required" }, 400, cors);
        await env.DB.prepare(
          `INSERT INTO comments (id, page, section, section_label, target, kind, author, body, status, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?9, ?5, ?6, ?7, 'open', ?8, ?8)`
        ).bind(row.id, row.page, row.section, row.section_label, row.kind, row.author, row.body, row.created_at, row.target).run();
        const saved = await env.DB.prepare("SELECT * FROM comments WHERE id = ?1").bind(row.id).first();
        return json({ comment: toApi(saved) }, 201, cors);
      }

      if (id && request.method === "PATCH") {
        const input = await request.json();
        if (!["open", "resolved"].includes(input.status)) return json({ error: "status must be open or resolved" }, 400, cors);
        const res = await env.DB.prepare("UPDATE comments SET status = ?1, updated_at = ?2 WHERE id = ?3")
          .bind(input.status, new Date().toISOString(), id).run();
        if (!res.meta.changes) return json({ error: "not found" }, 404, cors);
        const saved = await env.DB.prepare("SELECT * FROM comments WHERE id = ?1").bind(id).first();
        return json({ comment: toApi(saved) }, 200, cors);
      }

      if (id && request.method === "DELETE") {
        const res = await env.DB.prepare("DELETE FROM comments WHERE id = ?1").bind(id).run();
        if (!res.meta.changes) return json({ error: "not found" }, 404, cors);
        return json({ deleted: id }, 200, cors);
      }

      return json({ error: "method not allowed" }, 405, cors);
    } catch (err) {
      if (err instanceof SyntaxError) return json({ error: "invalid JSON" }, 400, cors);
      console.error(err);
      return json({ error: "server error" }, 500, cors);
    }
  },
};

function toApi(r) {
  return {
    id: r.id,
    page: r.page,
    section: r.section,
    sectionLabel: r.section_label,
    target: r.target || null,
    kind: r.kind,
    author: r.author,
    body: r.body,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function short(v) {
  return String(v || "").trim().slice(0, MAX_SHORT);
}

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Review-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (ok) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Length-independent comparison so response timing doesn't leak the key.
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
