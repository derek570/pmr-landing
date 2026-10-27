/* PMR Bike Couriers — review mode
 *
 * Lets John (or anyone with the review link) double-tap any part of the site
 * to leave a comment or suggest new content about it. The comment records
 * the section and the text or photo that was tapped. Each section also has
 * a Comment button. Open the site once with
 * ?review=<key> and review mode stays on in that browser until "Exit review".
 * Comments are stored by the pmr-site-review Worker (see review-worker/).
 *
 * While the site is a private draft that only John has the link to,
 * DRAFT_OPEN turns review mode on for every visitor and the Worker's
 * OPEN_REVIEW variable accepts comments without the key. Set both to false
 * before launch; then only ?review=<key> turns it on.
 */
(function () {
  const API = "https://pmr-site-review.derek-e10.workers.dev";
  const KEY_STORE = "pmrReviewKey";
  const NAME_STORE = "pmrReviewName";
  const OFF_STORE = "pmrReviewOff"; // set by "Exit review" so it stays off in this browser
  const DRAFT_OPEN = true;

  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("review");
  if (fromUrl === "off") {
    store(KEY_STORE, null);
    store(OFF_STORE, "1");
  } else if (fromUrl) {
    store(KEY_STORE, fromUrl);
    store(OFF_STORE, null);
  }
  const key = read(KEY_STORE) || (DRAFT_OPEN && !read(OFF_STORE) ? "draft" : null);
  if (!key) return;

  if (fromUrl) {
    // keep the key out of the address bar so it isn't shared by accident
    params.delete("review");
    const q = params.toString();
    history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
  }

  const page = location.pathname.split("/").pop() || "index.html";
  let comments = [];
  let active = null; // section key the drawer is showing, or "__all"
  let target = null; // what was double-tapped, for example "Photo: Bike on track"
  const pseudoLabels = {}; // labels for parts of the page outside any [data-review] section

  injectStyles();
  const ui = buildUi();
  const sections = [...document.querySelectorAll("[data-review]")];
  sections.forEach(attach);
  // gallery reels are built after load; pick them up when they appear
  new MutationObserver(() => {
    document.querySelectorAll("[data-review]:not([data-review-ready])").forEach((el) => {
      attach(el);
      sections.push(el);
      paintCounts();
    });
  }).observe(document.body, { childList: true, subtree: true });

  // Double-tap (or double-click) anywhere to comment on that spot. Handled in
  // the capture phase so the second tap can be stopped before it closes a
  // lightbox or follows a link. Keyboard clicks (detail 0) are ignored.
  let lastTap = null;
  document.addEventListener("click", (e) => {
    if (!e.detail || e.target.closest(".rv-drawer, .rv-bar, .rv-pin")) {
      lastTap = null;
      return;
    }
    const now = performance.now();
    if (lastTap && now - lastTap.t < 400 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
      e.preventDefault();
      e.stopPropagation();
      const first = lastTap.el;
      lastTap = null;
      window.getSelection()?.removeAllRanges();
      // a first tap on a gallery photo opens the lightbox; close it again
      const box = document.querySelector(".lightbox.is-open");
      if (box && !first.closest(".lightbox")) box.querySelector(".lightbox__close")?.click();
      lastTap = null; // the programmatic close click above registered as a tap
      commentOn(first);
      return;
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY, el: e.target };
  }, true);

  load().then(() => {
    const m = location.hash.match(/^#review-(.+)$/);
    if (m) {
      const el = document.querySelector(`[data-review="${CSS.escape(m[1])}"]`);
      el?.scrollIntoView({ block: "center" });
      openDrawer(m[1]);
    }
  });

  /* ---------------- data ---------------- */
  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      ...opts,
      headers: { "Content-Type": "application/json", "X-Review-Key": key, ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      store(KEY_STORE, null);
      throw new Error("This review link isn’t valid any more. Ask Derek for a new one.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
    return data;
  }

  async function load() {
    try {
      comments = (await api("/comments")).comments;
      ui.status.textContent = "";
    } catch (e) {
      ui.status.textContent = e.message;
    }
    paintCounts();
    if (active) renderDrawer();
  }

  /* ---------------- sections ---------------- */
  function attach(el) {
    el.dataset.reviewReady = "1";
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.classList.add("rv-section");
    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "rv-pin";
    pin.setAttribute("aria-label", "Comment on " + labelOf(el));
    pin.innerHTML = '<span aria-hidden="true">💬</span><span class="rv-pin__label">Comment</span><span class="rv-pin__count" hidden></span>';
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      openDrawer(el.dataset.review);
    });
    el.appendChild(pin);
  }

  /* ---------------- double-tap targets ---------------- */
  function commentOn(el) {
    const host = el.closest("[data-review]");
    let section;
    if (host) section = host.dataset.review;
    else {
      const p = pseudoSection(el);
      pseudoLabels[p.key] = p.label;
      section = p.key;
    }
    openDrawer(section);
    setTarget(describe(el));
    flash(el.closest("h1, h2, h3, h4, p, li, blockquote, figure, img, .btn, .stat, .card, .reel-row__item") || el);
  }

  // Parts of the page that aren't inside a review section.
  function pseudoSection(el) {
    if (el.closest(".lightbox")) return { key: "gallery-photo", label: "Gallery: photo viewer" };
    if (el.closest("footer")) return { key: "site-footer", label: "Footer" };
    if (el.closest("header, .nav")) return { key: "site-menu", label: "Menu bar" };
    return { key: "page-other", label: document.title.split(" — ")[0] + ": other" };
  }

  // A short, human description of what was tapped.
  function describe(el) {
    const img = el.closest("img") || el.closest(".reel-row__item, figure, .card__media, .svc__media")?.querySelector("img");
    if (img) return "Photo: " + (img.alt || decodeURIComponent(img.src.split("/").pop()));
    if (el.closest("video")) return "Video";
    const block = el.closest("h1, h2, h3, h4, p, li, blockquote, figcaption, label, a, button, .stat") || el;
    const text = block.textContent.replace(/\s+/g, " ").trim();
    return text.length > 140 ? text.slice(0, 137) + "…" : text;
  }

  function flash(el) {
    el.classList.add("rv-flash");
    setTimeout(() => el.classList.remove("rv-flash"), 1600);
  }

  function setTarget(text) {
    target = text || null;
    ui.target.hidden = !target;
    ui.target.querySelector("q").textContent = target || "";
  }

  function sectionLabel(key) {
    const el = document.querySelector(`[data-review="${CSS.escape(key)}"]`);
    if (el) return labelOf(el);
    return pseudoLabels[key] || comments.find((c) => c.section === key)?.sectionLabel || key;
  }

  function labelOf(el) {
    return el.dataset.reviewLabel || el.querySelector("h1, h2, h3")?.textContent.trim() || el.dataset.review;
  }

  function paintCounts() {
    sections.forEach((el) => {
      const open = comments.filter((c) => c.section === el.dataset.review && c.page === page && c.status === "open").length;
      const badge = el.querySelector(":scope > .rv-pin .rv-pin__count");
      if (!badge) return;
      badge.hidden = !open;
      badge.textContent = open;
      el.classList.toggle("rv-has-open", open > 0);
    });
    const openAll = comments.filter((c) => c.status === "open").length;
    ui.allBtn.textContent = `All comments (${openAll} open)`;
  }

  /* ---------------- drawer ---------------- */
  function openDrawer(section) {
    active = section;
    document.querySelectorAll(".rv-section.rv-active").forEach((s) => s.classList.remove("rv-active"));
    document.querySelector(`[data-review="${CSS.escape(section)}"]`)?.classList.add("rv-active");
    ui.drawer.classList.add("is-open");
    ui.drawer.setAttribute("aria-hidden", "false");
    setTarget(null);
    renderDrawer();
    ui.drawer.querySelector(".rv-drawer__close").focus();
  }

  function closeDrawer() {
    active = null;
    setTarget(null);
    ui.drawer.classList.remove("is-open");
    ui.drawer.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".rv-section.rv-active").forEach((s) => s.classList.remove("rv-active"));
  }

  function renderDrawer() {
    const all = active === "__all";
    ui.title.textContent = all ? "All comments" : sectionLabel(active);
    const list = all
      ? comments.slice().sort((a, b) => (a.status === b.status ? 0 : a.status === "open" ? -1 : 1))
      : comments.filter((c) => c.section === active && c.page === page);

    ui.list.innerHTML = list.length
      ? ""
      : `<p class="rv-empty">${all ? "No comments yet." : "No comments on this section yet. Be the first."}</p>`;
    list.forEach((c) => ui.list.appendChild(renderComment(c, all)));
    ui.form.hidden = all;
  }

  function renderComment(c, showWhere) {
    const item = document.createElement("article");
    item.className = "rv-item" + (c.status === "resolved" ? " rv-item--done" : "");
    const when = new Date(c.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const where = showWhere
      ? `<a class="rv-item__where" href="${esc(c.page)}#review-${encodeURIComponent(c.section)}">${esc(c.sectionLabel)}</a>`
      : "";
    item.innerHTML = `
      ${where}
      <header><strong>${esc(c.author)}</strong><span class="rv-tag rv-tag--${c.kind}">${c.kind === "content" ? "New content" : "Comment"}</span><time>${when}</time></header>
      ${c.target ? `<blockquote class="rv-item__target">${esc(c.target)}</blockquote>` : ""}
      <p>${esc(c.body).replace(/\n/g, "<br>")}</p>
      <div class="rv-item__actions">
        <button type="button" data-act="status">${c.status === "open" ? "✓ Mark done" : "↺ Reopen"}</button>
        <button type="button" data-act="delete">Delete</button>
      </div>`;
    item.querySelector('[data-act="status"]').addEventListener("click", () => update(c, { status: c.status === "open" ? "resolved" : "open" }));
    item.querySelector('[data-act="delete"]').addEventListener("click", (e) => {
      // two-step delete instead of a browser confirm() dialog
      if (e.currentTarget.dataset.armed) return remove(c);
      e.currentTarget.dataset.armed = "1";
      e.currentTarget.textContent = "Tap again to delete";
    });
    return item;
  }

  async function update(c, patch) {
    try {
      const { comment } = await api("/comments/" + c.id, { method: "PATCH", body: JSON.stringify(patch) });
      Object.assign(c, comment);
      paintCounts();
      renderDrawer();
    } catch (e) {
      ui.status.textContent = e.message;
    }
  }

  async function remove(c) {
    try {
      await api("/comments/" + c.id, { method: "DELETE" });
      comments = comments.filter((x) => x.id !== c.id);
      paintCounts();
      renderDrawer();
    } catch (e) {
      ui.status.textContent = e.message;
    }
  }

  async function submit(e) {
    e.preventDefault();
    const f = ui.form.elements;
    const body = f.body.value.trim();
    const author = f.author.value.trim();
    if (!author) return f.author.focus();
    if (!body) return f.body.focus();
    store(NAME_STORE, author);
    f.send.disabled = true;
    try {
      const { comment } = await api("/comments", {
        method: "POST",
        body: JSON.stringify({
          page,
          section: active,
          sectionLabel: sectionLabel(active),
          target,
          kind: f.kind.value,
          author,
          body,
        }),
      });
      comments.push(comment);
      f.body.value = "";
      setTarget(null);
      ui.formNote.textContent = "Saved. Derek will see it.";
      paintCounts();
      renderDrawer();
    } catch (err) {
      ui.formNote.textContent = err.message;
    } finally {
      f.send.disabled = false;
    }
  }

  /* ---------------- chrome ---------------- */
  function buildUi() {
    const bar = document.createElement("div");
    bar.className = "rv-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Review mode");
    bar.innerHTML = `
      <span class="rv-bar__dot" aria-hidden="true"></span>
      <span class="rv-bar__text"><strong>Review mode</strong> · double-tap anything to comment</span>
      <button type="button" class="rv-bar__all"></button>
      <button type="button" class="rv-bar__exit">Exit review</button>
      <span class="rv-bar__status" role="status"></span>`;
    document.body.appendChild(bar);

    const drawer = document.createElement("aside");
    drawer.className = "rv-drawer";
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("aria-labelledby", "rv-title");
    drawer.innerHTML = `
      <div class="rv-drawer__head">
        <h2 id="rv-title"></h2>
        <button type="button" class="rv-drawer__close" aria-label="Close comments">✕</button>
      </div>
      <div class="rv-list"></div>
      <form class="rv-form" novalidate>
        <fieldset>
          <legend>What would you like to do?</legend>
          <label><input type="radio" name="kind" value="comment" checked> Comment or change</label>
          <label><input type="radio" name="kind" value="content"> Add new content</label>
        </fieldset>
        <p class="rv-form__target" hidden>About: <q></q> <button type="button" aria-label="Comment on the whole section instead">✕</button></p>
        <label for="rv-body">Your note</label>
        <textarea id="rv-body" name="body" rows="5" placeholder="For example: change the price, add a line about Brands Hatch, swap this photo…"></textarea>
        <label for="rv-author">Your name</label>
        <input id="rv-author" name="author" autocomplete="name">
        <button type="submit" name="send" class="btn btn--red">Save comment</button>
        <p class="rv-form__note" role="status"></p>
      </form>`;
    document.body.appendChild(drawer);

    const form = drawer.querySelector(".rv-form");
    form.elements.author.value = read(NAME_STORE) || "";
    form.addEventListener("submit", submit);
    form.querySelector(".rv-form__target button").addEventListener("click", () => setTarget(null));
    drawer.querySelector(".rv-drawer__close").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && active) closeDrawer(); });
    bar.querySelector(".rv-bar__all").addEventListener("click", () => openDrawer("__all"));
    bar.querySelector(".rv-bar__exit").addEventListener("click", () => {
      store(KEY_STORE, null);
      store(OFF_STORE, "1");
      location.reload();
    });
    // pick up comments John adds from another device while the page is open
    setInterval(() => { if (!document.hidden) load(); }, 60000);

    return {
      bar,
      drawer,
      form,
      title: drawer.querySelector("#rv-title"),
      target: form.querySelector(".rv-form__target"),
      list: drawer.querySelector(".rv-list"),
      formNote: drawer.querySelector(".rv-form__note"),
      allBtn: bar.querySelector(".rv-bar__all"),
      status: bar.querySelector(".rv-bar__status"),
    };
  }

  function injectStyles() {
    const css = `
      html { touch-action: manipulation; } /* stops double-tap zoom so double-tap can open comments */
      .rv-section { outline: 2px dashed transparent; outline-offset: -6px; transition: outline-color .2s; }
      .rv-flash { outline: 3px solid #ffc400 !important; outline-offset: 4px; border-radius: 4px; }
      .rv-form__target { font-size: 14px; color: var(--muted); display: flex; gap: 8px; align-items: flex-start; }
      .rv-form__target[hidden] { display: none; }
      .rv-form__target q { flex: 1; color: var(--white); font-style: italic; }
      .rv-form__target button { flex: 0 0 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(255,255,255,.18); background: transparent; color: #fff; cursor: pointer; }
      .rv-item__target { margin: 0 0 8px; padding: 6px 10px; border-left: 3px solid #ffc400; background: rgba(255,196,0,.08); font-size: 14px; font-style: italic; color: var(--muted); }
      .rv-section:hover, .rv-section.rv-active { outline-color: rgba(225,6,0,.7); }
      .rv-section.rv-has-open { outline-color: rgba(255,196,0,.55); }
      .rv-pin { position: absolute; top: 12px; right: 12px; z-index: 40; display: inline-flex; align-items: center; gap: 6px;
        min-height: 44px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.25);
        background: rgba(10,10,10,.85); color: #fff; font: 600 14px/1 var(--body); cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.5); }
      .rv-pin:hover { border-color: var(--red); }
      .rv-pin:focus-visible, .rv-bar button:focus-visible, .rv-drawer button:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }
      .rv-pin__count { background: var(--red); border-radius: 999px; min-width: 22px; height: 22px; padding: 0 6px;
        display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
      .rv-pin__count[hidden] { display: none; }
      .page-hero .rv-pin, .hero .rv-pin { top: 76px; }
      .rv-bar { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 95; display: flex; align-items: center;
        gap: 10px; flex-wrap: wrap; justify-content: center; width: max-content; max-width: calc(100vw - 32px); padding: 8px 10px 8px 16px;
        background: #141414; border: 1px solid rgba(255,255,255,.18); border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.6);
        font: 14px/1.3 var(--body); color: var(--white); }
      .rv-bar__dot { width: 10px; height: 10px; border-radius: 50%; background: var(--red); box-shadow: 0 0 0 4px rgba(225,6,0,.25); }
      .rv-bar button { min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18);
        background: #1e1e1e; color: var(--white); font: 600 14px var(--body); cursor: pointer; white-space: nowrap; }
      .rv-bar button:hover { border-color: var(--red); }
      .rv-bar__status:empty { display: none; }
      .rv-bar__status { color: #ffb4b0; width: 100%; text-align: center; }
      .rv-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 96; width: min(440px, 100vw); display: flex; flex-direction: column;
        background: #141414; border-left: 1px solid rgba(255,255,255,.12); box-shadow: -20px 0 60px rgba(0,0,0,.6);
        transform: translateX(105%); transition: transform .3s ease; font-family: var(--body); color: var(--white); }
      .rv-drawer.is-open { transform: none; }
      .rv-drawer__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 20px 12px; border-bottom: 1px solid rgba(255,255,255,.1); }
      .rv-drawer__head h2 { font: 600 18px/1.35 var(--body); }
      .rv-drawer__close { flex: 0 0 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,.18); background: transparent; color: #fff; font-size: 18px; cursor: pointer; }
      .rv-list { flex: 1; overflow-y: auto; padding: 12px 20px; display: grid; gap: 12px; align-content: start; }
      .rv-empty { color: var(--muted); font-size: 15px; padding: 12px 0; }
      .rv-item { background: #1e1e1e; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 14px; font-size: 15px; }
      .rv-item--done { opacity: .55; }
      .rv-item--done p { text-decoration: line-through; }
      .rv-item header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
      .rv-item time { color: var(--muted); font-size: 12px; margin-left: auto; }
      .rv-item__where { display: block; color: var(--red); font-size: 13px; font-weight: 600; margin-bottom: 6px; text-decoration: none; }
      .rv-item__where:hover { text-decoration: underline; }
      .rv-tag { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,.1); }
      .rv-tag--content { background: rgba(225,6,0,.2); color: #ff8a85; }
      .rv-item__actions { display: flex; gap: 8px; margin-top: 10px; }
      .rv-item__actions button { min-height: 36px; padding: 0 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); background: transparent; color: var(--white); font: 500 13px var(--body); cursor: pointer; }
      .rv-item__actions button:hover { border-color: var(--red); }
      .rv-form { border-top: 1px solid rgba(255,255,255,.1); padding: 16px 20px 20px; display: grid; gap: 8px; }
      .rv-form[hidden] { display: none; }
      .rv-form fieldset { border: 0; display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 4px; }
      .rv-form legend { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
      .rv-form fieldset label { display: inline-flex; gap: 6px; align-items: center; font-size: 14px; min-height: 32px; cursor: pointer; }
      .rv-form > label { font-size: 14px; font-weight: 600; margin-top: 4px; }
      .rv-form textarea, .rv-form input[name=author] { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); background: #0a0a0a; color: #fff; font: 15px/1.4 var(--body); min-height: 44px; }
      .rv-form textarea:focus, .rv-form input:focus { outline: 2px solid var(--red); outline-offset: 1px; }
      .rv-form .btn { margin-top: 6px; justify-content: center; border: 0; cursor: pointer; }
      .rv-form .btn:disabled { opacity: .5; cursor: not-allowed; }
      .rv-form__note { color: var(--muted); font-size: 13px; min-height: 1em; }
      @media (max-width: 767px) {
        .rv-bar__text { display: none; }
        .rv-pin__label { display: none; }
        .rv-drawer { width: 100vw; top: auto; height: 85vh; border-left: 0; border-top: 1px solid rgba(255,255,255,.12); border-radius: 16px 16px 0 0; transform: translateY(105%); }
      }`;
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function read(k) {
    try { return localStorage.getItem(k); } catch { return null; }
  }
  function store(k, v) {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode: review mode lasts this page only */ }
  }
})();
