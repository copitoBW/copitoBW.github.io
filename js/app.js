(() => {
  "use strict";

  const LANGS = ["en", "ja", "es"];
  const app = document.getElementById("app");
  const toastEl = document.getElementById("toast");

  // ---------- small helpers ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  let lang = store.get("lang");
  if (!LANGS.includes(lang)) {
    const nav = (navigator.language || "en").slice(0, 2);
    lang = LANGS.includes(nav) ? nav : "en";
  }

  const t = (key, ...args) => {
    const v = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key];
    return typeof v === "function" ? v(...args) : v;
  };
  const loc = (obj) => (obj && (obj[lang] || obj.en)) || "";

  // ---------- prefecture lookup ----------
  const P = {};       // slug -> info
  const byCode = {};  // "13" -> info
  for (const [code, slug, en, ja, es, region] of PREFECTURES) {
    const info = { code, slug, names: { en, ja, es }, region };
    P[slug] = info; byCode[code] = info;
  }
  const prefName = (info) => info.names[lang] || info.names.en;
  const prefAlt = (info) => (lang === "ja" ? info.names.en : info.names.ja);

  let DATA = null;    // trips
  let FEATURES = null; // GeoJSON features by code
  const visited = new Map(); // slug -> place entry
  const nextSet = new Set();

  // ---------- theme ----------
  const themeBtn = document.getElementById("themeBtn");
  function currentTheme() {
    const set = document.documentElement.dataset.theme;
    if (set) return set;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  themeBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
  });

  // ---------- language ----------
  document.querySelectorAll("[data-lang]").forEach((b) =>
    b.addEventListener("click", () => {
      lang = b.dataset.lang;
      store.set("lang", lang);
      render();
    })
  );

  function applyStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    themeBtn.setAttribute("aria-label", t("theme"));
    themeBtn.title = t("theme");
    document.querySelector(".lang").setAttribute("aria-label", t("language"));
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  // ---------- placeholder "postcard" art ----------
  const PALETTES = [
    ["#f6bd60", "#f28482", "#84a59d", "#f7ede2"],
    ["#ffcdb2", "#e5989b", "#6d6875", "#fff1e6"],
    ["#a8dadc", "#457b9d", "#1d3557", "#f1faee"],
    ["#ffd6a5", "#e76f51", "#2a9d8f", "#fefae0"],
    ["#cdb4db", "#ffafcc", "#7b6d8d", "#fdf0f5"],
    ["#e9c46a", "#f4a261", "#264653", "#fbf3e4"]
  ];
  function hash(s) { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; }
  function postcard(seed) {
    const n = hash(seed);
    const [sky, sun, hill, light] = PALETTES[n % PALETTES.length];
    const sx = 30 + (n % 50), sy = 28 + ((n >> 3) % 18);
    const peak = 38 + ((n >> 5) % 20);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML =
      `<defs><linearGradient id="g${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${sky}"/></linearGradient></defs>` +
      `<rect width="100" height="100" fill="url(#g${n})"/>` +
      `<circle cx="${sx}" cy="${sy}" r="11" fill="${sun}" opacity=".9"/>` +
      `<path d="M0 72 L${peak - 18} 50 L${peak} ${40 + (n % 8)} L${peak + 20} 56 L70 48 L100 66 V100 H0Z" fill="${hill}" opacity=".55"/>` +
      `<path d="M0 82 Q25 70 50 80 T100 76 V100 H0Z" fill="${hill}"/>` +
      `<path d="M8 90 h18 M40 93 h22 M72 89 h16" stroke="${light}" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>`;
    return svg;
  }

  // ---------- map drawing ----------
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  function attachTip(card, svg) {
    const tip = h("div", { class: "map-tip" });
    card.append(tip);
    const show = (e, text) => {
      const r = card.getBoundingClientRect();
      tip.textContent = text;
      tip.style.left = `${e.clientX - r.left}px`;
      tip.style.top = `${e.clientY - r.top}px`;
      tip.style.opacity = "1";
    };
    svg.addEventListener("pointermove", (e) => {
      const code = e.target.dataset && e.target.dataset.code;
      if (code) show(e, prefName(byCode[code])); else tip.style.opacity = "0";
    });
    svg.addEventListener("pointerleave", () => { tip.style.opacity = "0"; });
  }

  function japanMap() {
    const W = 800, H = 800;
    const main = d3.geoMercator().fitExtent([[18, 18], [W - 18, H - 18]],
      { type: "MultiPoint", coordinates: [[128.5, 30.8], [146.0, 45.6]] });
    const okinawa = FEATURES["47"];
    const inset = d3.geoMercator().fitExtent([[36, 62], [296, 262]], focusShape(okinawa, [], 0.05));
    const pathMain = d3.geoPath(main), pathInset = d3.geoPath(inset);

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": t("title") });
    svg.append(svgEl("rect", { class: "inset-box", x: 22, y: 22, width: 290, height: 254, rx: 8 }));
    const lbl = svgEl("text", { class: "inset-label", x: 36, y: 52 });
    lbl.textContent = prefName(P.okinawa);
    svg.append(lbl);

    for (const code of Object.keys(FEATURES)) {
      const info = byCode[code];
      const isVisited = visited.has(info.slug);
      const d = (code === "47" ? pathInset : pathMain)(FEATURES[code]);
      const cls = "pref" + (isVisited ? " visited" : nextSet.has(info.slug) ? " next" : "");
      const p = svgEl("path", { d, class: cls, "data-code": code });
      const title = svgEl("title");
      title.textContent = prefName(info);
      p.append(title);
      if (isVisited) {
        p.setAttribute("tabindex", "0");
        p.setAttribute("role", "link");
        p.setAttribute("aria-label", prefName(info));
        p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(info.slug); } });
      }
      p.addEventListener("click", () => (isVisited ? go(info.slug) : toast(`${prefName(info)} — ${t("notYet")}`)));
      svg.append(p);
    }
    return svg;
  }

  // Bounds that ignore tiny far-off islands (so Tokyo isn't zoomed out to Ogasawara).
  function focusShape(feature, spots, minShare = 0.15) {
    const g = feature.geometry;
    let polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    const areas = polys.map((c) => d3.geoArea({ type: "Polygon", coordinates: c }));
    const max = Math.max(...areas);
    polys = polys.filter((_, i) => areas[i] >= max * minShare);
    const geoms = [{ type: "MultiPolygon", coordinates: polys }];
    if (spots.length) geoms.push({ type: "MultiPoint", coordinates: spots.map((s) => [s.lon, s.lat]) });
    return { type: "GeometryCollection", geometries: geoms };
  }

  function prefectureMap(info, place) {
    const W = 600, H = 520;
    const spots = place.spots || [];
    const proj = d3.geoMercator().fitExtent([[40, 40], [W - 40, H - 40]], focusShape(FEATURES[info.code], spots));
    const path = d3.geoPath(proj);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": prefName(info) });

    for (const code of Object.keys(FEATURES)) {
      if (code === info.code) continue;
      svg.append(svgEl("path", { d: path(FEATURES[code]), class: "pref context", "data-code": code }));
    }
    svg.append(svgEl("path", { d: path(FEATURES[info.code]), class: "pref focus", "data-code": info.code }));

    spots.forEach((s, i) => {
      const [x, y] = proj([s.lon, s.lat]);
      const g = svgEl("g", { class: "pin", tabindex: "0", role: "link", "aria-label": loc(s.name) });
      g.append(svgEl("circle", { cx: x, cy: y, r: 11 }));
      const right = x < W - 200;
      const label = svgEl("text", { x: right ? x + 17 : x - 17, y: y + 10, "text-anchor": right ? "start" : "end" });
      label.textContent = loc(s.name);
      g.append(label);
      const jump = () => document.getElementById(`spot-${i}`)?.scrollIntoView({ behavior: "smooth" });
      g.addEventListener("click", jump);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter") jump(); });
      svg.append(g);
    });
    return svg;
  }

  // ---------- views ----------
  function polaroidLink(info, place) {
    const first = (place.spots || []).flatMap((s) => s.photos || [])[0];
    const pic = h("div", { class: "pic" });
    if (first) pic.append(h("img", { src: first.src, alt: "", loading: "lazy" }));
    else pic.append(postcard(info.slug));
    const n = (place.spots || []).length;
    return h("a", { class: "polaroid", href: `#/japan/${info.slug}` },
      pic,
      h("div", { class: "cap" }, prefName(info)),
      h("div", { class: "sub" }, n ? t("spotsCount", n) : prefAlt(info)));
  }

  function homeView() {
    const total = PREFECTURES.length;
    const n = visited.size;

    const bar = h("div", { class: "bar" }, h("span", { style: "width:0" }));
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.firstChild.style.width = `${(n / total) * 100}%`; }));

    const card = h("div", { class: "map-card" });
    const svg = japanMap();
    card.append(svg);
    attachTip(card, svg);

    const legend = h("div", { class: "legend" },
      h("span", {}, h("i", { style: "background:var(--visited)" }), t("legendVisited")),
      h("span", {}, h("i", { style: "background:var(--next)" }), t("legendNext")),
      h("span", {}, h("i", { style: "background:var(--none)" }), t("legendNone")));

    const nextItems = [...nextSet].filter((s) => P[s]).map((s) => h("li", {}, prefName(P[s])));

    // visited list, grouped by JIS order (north to south)
    const cards = PREFECTURES.filter(([, slug]) => visited.has(slug)).map(([, slug]) => polaroidLink(P[slug], visited.get(slug)));

    return [
      h("section", { class: "hero" }, h("h1", {}, t("title")), h("p", {}, t("subtitle"))),
      h("div", { class: "counter" }, h("strong", {}, t("counter", n, total)), bar),
      card,
      legend,
      h("p", { class: "hint" }, t("tapHint")),
      h("h2", { class: "section-title" }, t("nextTitle")),
      h("div", { class: "next-card" }, nextItems.length ? h("ul", { class: "next-list" }, nextItems) : h("p", { class: "muted" }, t("nextEmpty"))),
      h("h2", { class: "section-title" }, t("visitedTitle")),
      h("div", { class: "grid" }, cards)
    ];
  }

  function prefectureView(slug) {
    const info = P[slug];
    const place = visited.get(slug);
    if (!info || !place) return [h("a", { class: "back", href: "#/" }, t("back")), h("p", {}, t("notFound"))];

    const mapCard = h("div", { class: "map-card" });
    const svg = prefectureMap(info, place);
    mapCard.append(svg);
    attachTip(mapCard, svg);

    const noteText = loc(place.note);
    const visits = place.visits || [];
    const note = h("div", { class: "note" },
      h("h2", {}, `✎ ${t("notes")}`),
      visits.length ? h("p", {}, h("strong", {}, `${t("visits")}: `), visits.join(" · ")) : null,
      noteText ? noteText.split(/\n+/).map((para) => h("p", {}, para)) : h("p", { class: "muted" }, t("noNote")));

    const spots = place.spots || [];
    const spotSections = spots.length
      ? spots.map((s, i) => {
          const photos = s.photos || [];
          const items = photos.length
            ? photos.map((ph) => h("button", { class: "polaroid", type: "button", onclick: () => openLightbox(ph) },
                h("div", { class: "pic" }, h("img", { src: ph.src, alt: loc(ph.caption) || loc(s.name), loading: "lazy" })),
                ph.caption ? h("div", { class: "cap" }, loc(ph.caption)) : null))
            : [h("div", { class: "polaroid" },
                h("div", { class: "pic" }, postcard(slug + i)),
                h("div", { class: "cap" }, loc(s.name)),
                h("div", { class: "sub" }, t("photoSoon")))];
          return h("section", { class: "spot", id: `spot-${i}` },
            h("h3", {}, loc(s.name), s.name && lang !== "ja" && s.name.ja ? h("small", {}, s.name.ja) : null),
            h("div", { class: "grid" }, items));
        })
      : [h("p", { class: "muted" }, t("noSpots"))];

    return [
      h("a", { class: "back", href: "#/" }, t("back")),
      h("div", { class: "pref-head" }, h("h1", {}, prefName(info)), h("div", { class: "alt" }, `${prefAlt(info)} · ${t("regions")[info.region]}`)),
      h("div", { class: "pref-layout" }, mapCard, h("div", {}, note)),
      h("h2", { class: "section-title" }, t("spots")),
      ...spotSections
    ];
  }

  // ---------- lightbox ----------
  const lb = h("div", { class: "lightbox", role: "dialog", "aria-modal": "true" });
  const lbImg = h("img", { alt: "" });
  const lbCap = h("p");
  const lbClose = h("button", { type: "button", "aria-label": "Close" }, "×");
  lb.append(lbClose, lbImg, lbCap);
  document.body.append(lb);
  const closeLb = () => { lb.classList.remove("open"); lbImg.src = ""; };
  lb.addEventListener("click", (e) => { if (e.target !== lbImg) closeLb(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLb(); });
  function openLightbox(ph) {
    lbImg.src = ph.src;
    lbImg.alt = loc(ph.caption);
    lbCap.textContent = loc(ph.caption);
    lb.classList.add("open");
  }

  // ---------- routing ----------
  function go(slug) { location.hash = `#/japan/${slug}`; }
  function route() {
    const m = location.hash.match(/^#\/japan\/([a-z]+)/);
    return m ? { view: "pref", slug: m[1] } : { view: "home" };
  }
  let lastRoute = "";
  function render() {
    applyStatic();
    if (!DATA) return;
    const r = route();
    app.replaceChildren(...(r.view === "pref" ? prefectureView(r.slug) : homeView()));
    const key = location.hash;
    if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
    document.title = r.view === "pref" && P[r.slug] ? `${prefName(P[r.slug])} · ${t("title")}` : t("title");
  }
  window.addEventListener("hashchange", render);

  // ---------- load ----------
  applyStatic();
  Promise.all([
    fetch("data/prefectures.topo.json").then((r) => r.json()),
    fetch("data/japan.json").then((r) => r.json())
  ]).then(([topo, data]) => {
    FEATURES = {};
    for (const f of topojson.feature(topo, topo.objects.prefectures).features) FEATURES[f.id] = f;
    DATA = data;
    for (const p of data.places || []) if (P[p.prefecture]) visited.set(p.prefecture, p);
    for (const s of data.next || []) nextSet.add(s);
    render();
  }).catch((err) => {
    app.replaceChildren(h("p", { class: "muted" }, "Could not load the map data."));
    console.error(err);
  });
})();
