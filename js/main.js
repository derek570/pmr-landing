/* PMR Bike Couriers — animations */
(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  navToggle();
  pcContactRoute();

  if (reduceMotion || typeof gsap === "undefined") {
    document.querySelector(".intro")?.remove();
    document.querySelectorAll(".stat__num[data-count]").forEach(setFinalCount);
    startReels();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  // this script runs on every page; home-only selectors are simply absent elsewhere
  gsap.config({ nullTargetWarn: false });

  /* ---------- intro wipe (home page only): bike races across, panels peel away ---------- */
  // Only on the first Home visit in a browsing session: replaying it on every
  // return to Home made moving between pages feel slow on a phone.
  const introSeen = document.documentElement.classList.contains("intro-seen");
  if (introSeen) document.querySelector(".intro")?.remove();
  const hasIntro = !introSeen && !!document.querySelector(".intro");
  if (hasIntro) {
    try { sessionStorage.setItem("pmrIntroSeen", "1"); } catch (e) { /* private mode: replay is harmless */ }
  }
  const intro = gsap.timeline({
    onComplete: () => document.querySelector(".intro")?.remove(),
  });
  if (hasIntro) intro
    .to(".intro__bike", {
      x: () => window.innerWidth + 320,
      duration: 0.9,
      ease: "power2.in",
    })
    .to(".intro__panel--1", { xPercent: 100, duration: 0.55, ease: "power3.inOut" }, "-=0.25")
    .to(".intro__panel--2", { xPercent: 100, duration: 0.55, ease: "power3.inOut" }, "-=0.38");

  /* ---------- hero headline ---------- */
  gsap.from(".hero__title-line > span", {
    yPercent: 110,
    skewY: 6,
    duration: 1,
    stagger: 0.14,
    ease: "power4.out",
    delay: hasIntro ? 1.1 : 0.1,
  });
  gsap.from(".hero__kicker, .hero__sub, .hero__actions", {
    opacity: 0,
    y: 24,
    duration: 0.8,
    stagger: 0.12,
    ease: "power2.out",
    delay: hasIntro ? 1.5 : 0.3,
  });
  gsap.from(".hero__stats .stat", {
    opacity: 0,
    y: 30,
    duration: 0.7,
    stagger: 0.1,
    ease: "power2.out",
    delay: hasIntro ? 1.8 : 0.45,
  });

  /* subtle hero video parallax on scroll */
  gsap.to(".hero__video", {
    yPercent: 8,
    ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
  });

  /* ---------- counters ---------- */
  document.querySelectorAll(".stat__num[data-count]").forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    const obj = { v: 0 };
    gsap.to(obj, {
      v: target,
      duration: 1.6,
      delay: hasIntro ? 1.9 : 0.5,
      ease: "power2.out",
      onUpdate: () => (el.textContent = prefix + Math.round(obj.v) + suffix),
    });
  });

  /* ---------- red strip marquee ---------- */
  marqueeLoop(".strip__track", 28, -1);

  /* ---------- line reveals on section headings ---------- */
  document.querySelectorAll(".reveal-lines").forEach((h) => {
    gsap.from(h.querySelectorAll("span"), {
      opacity: 0,
      y: 60,
      skewY: 4,
      duration: 0.9,
      stagger: 0.12,
      ease: "power3.out",
      scrollTrigger: { trigger: h, start: "top 85%" },
    });
  });

  /* ---------- about: copy + image parallax ---------- */
  gsap.from(".about__body, .about__points li", {
    opacity: 0,
    y: 30,
    duration: 0.7,
    stagger: 0.08,
    ease: "power2.out",
    scrollTrigger: { trigger: ".about", start: "top 70%" },
  });
  gsap.fromTo(
    ".about__media img:not(.about__badge)",
    { yPercent: -8, scale: 1.12 },
    {
      yPercent: 8,
      scale: 1.12,
      ease: "none",
      scrollTrigger: { trigger: ".about__media", start: "top bottom", end: "bottom top", scrub: true },
    }
  );

  /* ---------- bike fly-by ---------- */
  gsap.fromTo(
    ".flyby__bike",
    { x: -220 },
    {
      x: () => window.innerWidth + 260,
      ease: "none",
      scrollTrigger: { trigger: ".flyby", start: "top 95%", end: "top 15%", scrub: 1.2 },
    }
  );

  /* ---------- service cards ---------- */
  gsap.from(".services .card", {
    opacity: 0,
    y: 60,
    duration: 0.8,
    stagger: 0.12,
    ease: "power3.out",
    scrollTrigger: { trigger: ".services__grid", start: "top 82%" },
  });

  /* ---------- process: bike rides the route ---------- */
  const routePath = document.querySelector(".route-path");
  const routeBike = document.querySelector(".route-bike");
  if (routePath && routeBike) {
    const drawState = { p: 0 };
    const pathLen = routePath.getTotalLength();
    const svg = routePath.closest("svg");
    gsap.to(drawState, {
      p: 1,
      ease: "none",
      scrollTrigger: { trigger: ".process__route", start: "top 85%", end: "bottom 35%", scrub: 1 },
      onUpdate: () => {
        const pt = routePath.getPointAtLength(drawState.p * pathLen);
        const box = svg.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const x = (pt.x / vb.width) * box.width - 42;
        const y = (pt.y / vb.height) * box.height - 30;
        routeBike.style.transform = `translate(${x}px, ${y}px)`;
      },
    });
  }
  gsap.from(".process__steps .step", {
    opacity: 0,
    y: 40,
    duration: 0.7,
    stagger: 0.12,
    ease: "power2.out",
    scrollTrigger: { trigger: ".process__steps", start: "top 85%" },
  });

  /* ---------- gallery marquees (the moving wall) ---------- */
  marqueeLoop(".marquee--ltr .marquee__track", 45, -1);
  marqueeLoop(".marquee--rtl .marquee__track", 45, 1);

  /* ---------- reels + trusted + cta reveals ---------- */
  gsap.from(".reel", {
    opacity: 0,
    y: 60,
    duration: 0.8,
    stagger: 0.15,
    ease: "power3.out",
    scrollTrigger: { trigger: ".reels__grid", start: "top 82%" },
  });
  gsap.from(".trusted__names span", {
    opacity: 0,
    y: 24,
    duration: 0.6,
    stagger: 0.12,
    ease: "power2.out",
    scrollTrigger: { trigger: ".trusted", start: "top 85%" },
  });
  gsap.from(".cta__sub, .cta__actions", {
    opacity: 0,
    y: 30,
    duration: 0.8,
    stagger: 0.15,
    ease: "power2.out",
    scrollTrigger: { trigger: ".cta", start: "top 70%" },
  });

  /* ---------- inner pages: generic fade-ups ---------- */
  gsap.utils.toArray(".fade-up").forEach((el) => {
    gsap.from(el, {
      opacity: 0,
      y: 40,
      duration: 0.8,
      ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 88%" },
    });
  });

  startReels();
  smoothAnchors();

  /* re-measure once everything (fonts, images, video posters) has loaded */
  window.addEventListener("load", () => ScrollTrigger.refresh());

  /* ---------- helpers ---------- */
  function marqueeLoop(selector, duration, dir) {
    const track = document.querySelector(selector);
    if (!track) return;
    // track contains two identical halves, so a 50% shift loops seamlessly
    const from = dir === 1 ? -50 : 0;
    const to = dir === 1 ? 0 : -50;
    gsap.fromTo(
      track,
      { xPercent: from },
      { xPercent: to, duration, ease: "none", repeat: -1 }
    );
  }
})();

/* Autoplay reel videos only while on screen (saves battery/data) */
function startReels() {
  const vids = document.querySelectorAll(".reel video");
  if (!vids.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      });
    },
    { threshold: 0.35 }
  );
  vids.forEach((v) => io.observe(v));
}

/* Smooth-scroll for in-page anchors without CSS scroll-behavior */
function smoothAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth" });
    });
  });
}

/* Mobile menu: hamburger opens the nav as a drop-down panel */
function navToggle() {
  const nav = document.querySelector(".nav");
  const btn = document.querySelector(".nav__toggle");
  if (!nav || !btn) return;
  const set = (open) => {
    nav.classList.toggle("nav--open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  btn.addEventListener("click", () => set(!nav.classList.contains("nav--open")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
  nav.querySelectorAll(".nav__links a").forEach((a) => a.addEventListener("click", () => set(false)));
}

/* Red buttons open WhatsApp on phones and tablets. On a computer, where
   WhatsApp may not be set up, they go to the contact page instead, and the
   grey "Other ways to contact us" button beside them is hidden as a duplicate.
   A data-service attribute carries through as ?service= so the quote form
   preselects it. */
function pcContactRoute() {
  if (!isComputer()) return;
  const onContact = !!document.getElementById("quote-form");
  document.querySelectorAll("a.btn--wa").forEach((a) => {
    const svc = a.dataset.service;
    a.href = onContact ? "#quote-form" : "contact.html" + (svc ? "?service=" + encodeURIComponent(svc) : "");
    a.removeAttribute("target");
    a.removeAttribute("rel");
    a.classList.remove("btn--wa");
    if (a.textContent.trim() === "WhatsApp us") a.textContent = "Contact us";
  });
  document.querySelectorAll("[data-wa-alt]").forEach((a) => a.remove());
}

/* A mouse or trackpad as the main pointer means a computer. */
function isComputer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function setFinalCount(el) {
  el.textContent = (el.dataset.prefix || "") + el.dataset.count + (el.dataset.suffix || "");
}
