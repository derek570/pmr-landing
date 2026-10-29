/* PMR Bike Couriers — gallery
   Runs on two pages, both driven by assets/gallery/gallery.json:

   - gallery.html shows one reel per group. Each reel previews the first
     photos and slides sideways as the visitor scrolls, alternating direction.
     Visitors can also swipe it or use its arrow buttons, and the scroll
     movement carries on from wherever they left it. Tapping a group, or any
     photo in it, opens that group's album page.
   - gallery-album.html?g=<slug> shows every photo in one group as a grid.
     Any photo opens full size in the lightbox, and #photo-<n> in the address
     opens that photo straight away.

   A group can hold short video clips as well as photos (items with a
   "video" path). They show their poster frame with a play badge and play in
   the lightbox.

   To change the photos, run scripts/import-gallery.py rather than editing the
   JSON by hand. */
(function () {
  const reelsHost = document.getElementById("gallery-groups");
  const albumHost = document.getElementById("album");
  if (!reelsHost && !albumHost) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PREVIEW = 12; // photos shown in each reel before the "view all" tile

  fetch("assets/gallery/gallery.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => {
      const groups = data.groups || [];
      if (reelsHost) renderReels(groups);
      else renderAlbum(groups);
      if (typeof ScrollTrigger !== "undefined") {
        window.addEventListener("load", () => ScrollTrigger.refresh());
        document.querySelectorAll("main img").forEach((img) => img.addEventListener("load", () => ScrollTrigger.refresh(), { once: true }));
      }
    })
    .catch(() => {
      (reelsHost || albumHost).innerHTML = '<p class="gallery-empty">The gallery couldn’t load. See our latest photos on <a href="https://www.instagram.com/pmr_bike_couriers">Instagram</a>.</p>';
    });

  const albumUrl = (g, n) => `gallery-album.html?g=${encodeURIComponent(g.slug)}` + (n ? `#photo-${n}` : "");
  const thumbOf = (p) => p.thumb || p.src;
  const isVideo = (p) => Boolean(p.video);
  const playBadge = (p) => (isVideo(p) ? '<span class="play-badge" aria-hidden="true"></span>' : "");
  const countText = (g) => {
    const word = g.photos.length && g.photos.every(isVideo) ? "video" : "photo";
    return `${g.photos.length} ${word}${g.photos.length === 1 ? "" : "s"}`;
  };

  // "Wrapped and protected" -> "Wrapped and <em>protected</em>"
  function titleHtml(title) {
    const words = title.split(" ");
    const last = words.pop();
    return `${esc(words.join(" "))} <em>${esc(last)}</em>`;
  }

  /* ---------- gallery.html: one reel per group ---------- */
  function renderReels(groups) {
    groups.forEach((g, gi) => {
      const section = document.createElement("section");
      section.className = "reel-group" + (gi % 2 ? " band" : "");
      section.dataset.review = "gallery-" + g.slug;
      section.dataset.reviewLabel = "Gallery: " + g.title;
      section.innerHTML = `
        <div class="reel-group__head">
          <div>
            <h2 class="reel-group__title"><a href="${albumUrl(g)}">${titleHtml(g.title)}</a></h2>
            ${g.caption ? `<p class="reel-group__meta">${esc(g.caption)}</p>` : ""}
          </div>
          <a class="more reel-group__all" href="${albumUrl(g)}">View all ${countText(g)} →</a>
        </div>
        <div class="reel-row${gi % 3 === 1 ? " reel-row--tall" : ""}">
          <div class="reel-row__scroller"><div class="reel-row__track"></div></div>
          <button type="button" class="reel-row__arrow reel-row__arrow--prev" aria-label="Previous photos">‹</button>
          <button type="button" class="reel-row__arrow reel-row__arrow--next" aria-label="Next photos">›</button>
        </div>`;
      const track = section.querySelector(".reel-row__track");
      g.photos.slice(0, PREVIEW).forEach((p, i) => {
        const a = document.createElement("a");
        a.className = "reel-row__item";
        a.href = albumUrl(g, i + 1);
        a.setAttribute("aria-label", `${p.alt || g.title} — open the ${g.title} album`);
        a.innerHTML = `<img src="${encodeURI(thumbOf(p))}" alt="${esc(p.alt || "")}" loading="lazy">${playBadge(p)}`;
        track.appendChild(a);
      });
      if (g.photos.length > PREVIEW) {
        const more = document.createElement("a");
        more.className = "reel-row__item reel-row__more";
        more.href = albumUrl(g);
        more.innerHTML = `<span><strong>+${g.photos.length - PREVIEW}</strong>View all ${countText(g)}</span>`;
        track.appendChild(more);
      }
      reelsHost.appendChild(section);
      animateRow(section, track, gi % 2 === 0 ? -1 : 1);
    });
  }

  // The row is a native horizontal scroller, so touch swipes, trackpads and the
  // arrow buttons all work. Page scrolling drives its scrollLeft; a manual swipe
  // becomes an offset, so page scrolling resumes from where the visitor left it.
  function animateRow(section, track, dir) {
    const scroller = track.parentElement;
    const step = () => Math.max(240, scroller.clientWidth * 0.75);
    section.querySelector(".reel-row__arrow--prev").addEventListener("click", () => scroller.scrollBy({ left: -step(), behavior: "smooth" }));
    section.querySelector(".reel-row__arrow--next").addEventListener("click", () => scroller.scrollBy({ left: step(), behavior: "smooth" }));
    if (reduceMotion || typeof gsap === "undefined") return;

    const max = () => scroller.scrollWidth - scroller.clientWidth;
    const state = { p: 0 };
    let offset = 0;
    let lastSet = -1;
    let userUntil = 0;
    const target = () => (dir === -1 ? state.p : 1 - state.p) * max() + offset;

    // A scroll position we didn't set came from the visitor: keep it as the new offset.
    scroller.addEventListener("scroll", () => {
      if (Math.abs(scroller.scrollLeft - lastSet) <= 1) return;
      userUntil = Date.now() + 500;
      offset += scroller.scrollLeft - target();
    }, { passive: true });

    gsap.to(state, {
      p: 1,
      ease: "none",
      scrollTrigger: { trigger: section, start: "top bottom", end: "bottom top", scrub: 0.8 },
      onUpdate: () => {
        if (Date.now() < userUntil) return;
        const m = max();
        // Clamp the offset so the row can't drift past either end.
        offset = Math.min(Math.max(offset, -m), m);
        const x = Math.min(Math.max(target(), 0), m);
        scroller.scrollLeft = x;
        lastSet = scroller.scrollLeft;
      },
    });
    gsap.from(section.querySelector(".reel-group__head"), {
      opacity: 0,
      y: 40,
      duration: 0.8,
      ease: "power2.out",
      scrollTrigger: { trigger: section, start: "top 85%" },
    });
  }

  /* ---------- gallery-album.html: every photo in one group ---------- */
  function renderAlbum(groups) {
    const slug = new URLSearchParams(location.search).get("g");
    const g = groups.find((x) => x.slug === slug);
    if (!g) {
      location.replace("gallery.html");
      return;
    }
    document.title = `${g.title} — Gallery — PMR Bike Couriers`;
    document.getElementById("album-title").innerHTML = titleHtml(g.title);
    document.getElementById("album-sub").textContent = [g.caption, countText(g)].filter(Boolean).join(" · ");
    const heroBg = document.querySelector(".page-hero__bg");
    if (heroBg && g.photos[0]) heroBg.src = g.photos[0].src;

    const hero = document.querySelector(".page-hero");
    hero.dataset.review = "album-" + g.slug + "-hero";
    hero.dataset.reviewLabel = `Gallery album: ${g.title} heading`;
    albumHost.dataset.review = "album-" + g.slug;
    albumHost.dataset.reviewLabel = `Gallery album: ${g.title} photos`;

    const grid = document.createElement("div");
    grid.className = "album-grid";
    const box = lightbox(g.photos.map((p) => ({ ...p, group: g.title })));
    g.photos.forEach((p, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "album-grid__item";
      btn.id = `photo-${i + 1}`;
      btn.setAttribute("aria-label", (isVideo(p) ? "Play video: " : "View photo full size: ") + (p.alt || g.title));
      btn.innerHTML = `<img src="${encodeURI(thumbOf(p))}" alt="${esc(p.alt || "")}" loading="lazy">${playBadge(p)}`;
      btn.addEventListener("click", () => box.open(i));
      grid.appendChild(btn);
    });
    albumHost.appendChild(grid);

    // links to the other groups
    const nav = document.getElementById("album-others");
    groups.filter((x) => x !== g).forEach((x) => {
      const a = document.createElement("a");
      a.className = "album-pill";
      a.href = albumUrl(x);
      a.innerHTML = `<img src="${encodeURI(thumbOf(x.photos[0]))}" alt="" loading="lazy"><span>${esc(x.title)}<small>${countText(x)}</small></span>`;
      nav.appendChild(a);
    });

    const m = location.hash.match(/^#photo-(\d+)$/);
    if (m && g.photos[m[1] - 1]) box.open(m[1] - 1);
  }

  /* ---------- lightbox ---------- */
  function lightbox(items) {
    const box = document.getElementById("lightbox");
    const boxImg = box.querySelector("img");
    const boxCap = box.querySelector(".lightbox__caption");
    // One player, shown in place of the image when the current item is a clip.
    // Clips have no sound, so they autoplay muted and loop like a phone reel.
    const boxVid = document.createElement("video");
    boxVid.controls = true;
    boxVid.muted = true;
    boxVid.loop = true;
    boxVid.playsInline = true;
    boxVid.preload = "metadata";
    boxVid.hidden = true;
    boxImg.after(boxVid);
    let current = 0;
    let opener = null;

    function open(i) {
      opener = document.activeElement;
      show(i);
      box.classList.add("is-open");
      document.body.style.overflow = "hidden";
      box.querySelector(".lightbox__close").focus();
    }
    function close() {
      boxVid.pause();
      box.classList.remove("is-open");
      document.body.style.overflow = "";
      opener?.focus();
    }
    function show(i) {
      current = (i + items.length) % items.length;
      const item = items[current];
      boxVid.pause();
      boxImg.hidden = isVideo(item);
      boxVid.hidden = !isVideo(item);
      if (isVideo(item)) {
        boxVid.poster = item.src;
        boxVid.src = item.video;
        boxVid.setAttribute("aria-label", item.alt || item.group);
        boxVid.play().catch(() => {});
      } else {
        boxVid.removeAttribute("src");
        boxVid.load();
        boxImg.src = item.src;
        boxImg.alt = item.alt;
      }
      boxCap.textContent = `${items[current].alt || items[current].group} · ${current + 1} of ${items.length}`;
    }
    box.querySelector(".lightbox__close").addEventListener("click", close);
    box.querySelector(".lightbox__prev").addEventListener("click", () => show(current - 1));
    box.querySelector(".lightbox__next").addEventListener("click", () => show(current + 1));
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    document.addEventListener("keydown", (e) => {
      if (!box.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(current - 1);
      if (e.key === "ArrowRight") show(current + 1);
    });
    // swipe left or right on a phone to move between photos
    let touchX = null;
    box.addEventListener("touchstart", (e) => {
      // leave the bottom of a video to its own scrub bar
      const r = boxVid.getBoundingClientRect();
      const onScrubBar = e.target === boxVid && e.touches[0].clientY > r.bottom - 64;
      touchX = onScrubBar ? null : e.touches[0].clientX;
    }, { passive: true });
    box.addEventListener("touchend", (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
    });
    return { open };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
