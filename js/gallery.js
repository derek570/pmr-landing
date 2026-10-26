/* PMR Bike Couriers — gallery page
   Builds one reel per group from assets/gallery/gallery.json. Each reel slides
   sideways as the visitor scrolls down, alternating direction. Visitors can
   also swipe a reel or use its arrow buttons, and the scroll movement carries
   on from wherever they left it. Any photo opens full size in the lightbox. To change the photos, run
   scripts/import-gallery.py rather than editing the JSON by hand. */
(function () {
  const host = document.getElementById("gallery-groups");
  if (!host) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const all = []; // flat list for lightbox next/previous

  fetch("assets/gallery/gallery.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => render(data.groups || []))
    .catch(() => {
      host.innerHTML = '<p class="gallery-empty">The gallery couldn’t load. See our latest photos on <a href="https://www.instagram.com/pmr_bike_couriers">Instagram</a>.</p>';
    });

  function render(groups) {
    groups.forEach((g, gi) => {
      const slug = g.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const words = g.title.split(" ");
      const last = words.pop();
      const section = document.createElement("section");
      section.className = "reel-group" + (gi % 2 ? " band" : "");
      section.dataset.review = "gallery-" + slug;
      section.dataset.reviewLabel = "Gallery: " + g.title;
      section.innerHTML = `
        <div class="reel-group__head">
          <h2 class="reel-group__title">${esc(words.join(" "))} <em>${esc(last)}</em></h2>
          ${g.caption ? `<p class="reel-group__meta">${esc(g.caption)}</p>` : ""}
        </div>
        <div class="reel-row${gi % 3 === 1 ? " reel-row--tall" : ""}">
          <div class="reel-row__scroller"><div class="reel-row__track"></div></div>
          <button type="button" class="reel-row__arrow reel-row__arrow--prev" aria-label="Previous photos">‹</button>
          <button type="button" class="reel-row__arrow reel-row__arrow--next" aria-label="Next photos">›</button>
        </div>`;
      const track = section.querySelector(".reel-row__track");
      g.photos.forEach((p) => {
        const idx = all.push({ src: p.src, alt: p.alt || "", group: g.title }) - 1;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "reel-row__item";
        btn.setAttribute("aria-label", "View photo: " + (p.alt || g.title));
        btn.innerHTML = `<img src="${encodeURI(p.src)}" alt="${esc(p.alt || "")}" loading="lazy">`;
        btn.addEventListener("click", () => openBox(idx));
        track.appendChild(btn);
      });
      host.appendChild(section);
      animateRow(section, track, gi % 2 === 0 ? -1 : 1);
    });
    if (typeof ScrollTrigger !== "undefined") {
      window.addEventListener("load", () => ScrollTrigger.refresh());
      host.querySelectorAll("img").forEach((img) => img.addEventListener("load", () => ScrollTrigger.refresh(), { once: true }));
    }
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

  /* ---------- lightbox ---------- */
  const box = document.getElementById("lightbox");
  const boxImg = box.querySelector("img");
  const boxCap = box.querySelector(".lightbox__caption");
  let current = 0;
  let opener = null;

  function openBox(i) {
    opener = document.activeElement;
    show(i);
    box.classList.add("is-open");
    document.body.style.overflow = "hidden";
    box.querySelector(".lightbox__close").focus();
  }
  function closeBox() {
    box.classList.remove("is-open");
    document.body.style.overflow = "";
    opener?.focus();
  }
  function show(i) {
    current = (i + all.length) % all.length;
    boxImg.src = all[current].src;
    boxImg.alt = all[current].alt;
    boxCap.textContent = [all[current].group, all[current].alt].filter(Boolean).join(" · ");
  }
  box.querySelector(".lightbox__close").addEventListener("click", closeBox);
  box.querySelector(".lightbox__prev").addEventListener("click", () => show(current - 1));
  box.querySelector(".lightbox__next").addEventListener("click", () => show(current + 1));
  box.addEventListener("click", (e) => { if (e.target === box) closeBox(); });
  document.addEventListener("keydown", (e) => {
    if (!box.classList.contains("is-open")) return;
    if (e.key === "Escape") closeBox();
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
