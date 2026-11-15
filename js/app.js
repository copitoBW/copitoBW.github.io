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
  const LOCALES = { en: "en-GB", ja: "ja-JP", es: "es-PE" };
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(LOCALES[lang], { year: "numeric", month: "long", day: "numeric" }).format(new Date(y, m - 1, d));
  };

  // A spot can hold photos directly (older entries) and/or a list of dated visits.
  // An entry is either one shot ({src, thumb, caption}) or a stack of shots of the
  // same moment ({caption, shots: [{src, thumb}, ...]}), shown as a single card.
  // Every entry gets its visit date attached so the lightbox can show it.
  const spotVisits = (s) => (s.visits || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const spotItems = (s) => [
    ...(s.photos || []),
    ...spotVisits(s).flatMap((v) => (v.photos || []).map((p) => ({ ...p, date: v.date })))
  ];
  const shotsOf = (it) => (it.shots && it.shots.length
    ? it.shots.map((sh, i) => ({ ...it, ...sh, shots: undefined, shot: i + 1, of: it.shots.length }))
    : [it]);
  const spotPhotos = (s) => spotItems(s).flatMap(shotsOf);
  // Prefecture visit dates: written by hand, or collected from the spots' visits.
  const placeDates = (place) => {
    if (place.visits && place.visits.length) return place.visits;
    const set = new Set((place.spots || []).flatMap((s) => (s.visits || []).map((v) => v.date)));
    return [...set].sort();
  };

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
  let MUNI = null;     // municipality features, loaded on first prefecture page
  let muniLoading = null;
  const nextSpots = []; // {prefecture, name, lat, lon}
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
      const ds = e.target.dataset || {};
      const text = ds.name || (ds.code && byCode[ds.code] ? prefName(byCode[ds.code]) : "");
      if (text) show(e, text); else tip.style.opacity = "0";
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
    const zoomed = place.zoom && zoomState[info.slug] !== "all";
    const zoomTo = zoomed && MUNI ? MUNI.filter((f) => f.id.startsWith(place.zoom)) : null;
    const fitShape = zoomTo && zoomTo.length
      ? { type: "FeatureCollection", features: zoomTo }
      : focusShape(FEATURES[info.code], spots);
    const proj = d3.geoMercator().fitExtent([[40, 40], [W - 40, H - 40]], fitShape);
    const path = d3.geoPath(proj);
    const nexts = nextSpots.filter((n) => n.prefecture === info.slug);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": prefName(info) });

    for (const code of Object.keys(FEATURES)) {
      if (code === info.code) continue;
      svg.append(svgEl("path", { d: path(FEATURES[code]), class: "pref context", "data-code": code }));
    }
    svg.append(svgEl("path", { d: path(FEATURES[info.code]), class: "pref focus", "data-code": info.code }));

    if (MUNI) {
      const areas = new Set(place.areas || []);
      for (const f of MUNI) {
        if (f.id.slice(0, 2) !== info.code) continue;
        const hit = areas.has(f.id) || spots.some((s) => d3.geoContains(f, [s.lon, s.lat]));
        svg.append(svgEl("path", { d: path(f), class: "muni" + (hit ? " visited" : ""), "data-name": muniName(f) }));
      }
    }

    nexts.forEach((s) => {
      const [x, y] = proj([s.lon, s.lat]);
      const g = svgEl("g", { class: "pin next-pin" });
      g.append(svgEl("circle", { cx: x, cy: y, r: 11, "data-name": `${loc(s.name)}?` }));
      const right = x < W - 200;
      const label = svgEl("text", { x: right ? x + 17 : x - 17, y: y + 10, "text-anchor": right ? "start" : "end" });
      label.textContent = `${loc(s.name)}?`;
      g.append(label);
      svg.append(g);
    });

    spots.forEach((s, i) => {
      const [x, y] = proj([s.lon, s.lat]);
      const g = svgEl("g", { class: "pin", tabindex: "0", role: "link", "aria-label": loc(s.name) });
      g.append(svgEl("circle", { cx: x, cy: y, r: 11, "data-name": loc(s.name) }));
      const right = x < W - 200;
      const label = svgEl("text", { x: right ? x + 17 : x - 17, y: y + 10, "text-anchor": right ? "start" : "end" });
      label.textContent = loc(s.name);
      g.append(label);
      const jump = () => document.getElementById(`spot-${i}`)?.scrollIntoView({ behavior: "smooth" });
      g.addEventListener("click", jump);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter") jump(); });
      svg.append(g);
    });
    // Labels can only be measured once the map is on the page (and again once the font loads).
    requestAnimationFrame(() => placeLabels(svg, W, H));
    if (document.fonts) document.fonts.ready.then(() => placeLabels(svg, W, H));
    return svg;
  }

  // Keep pin labels from piling up where places are close together (central Tokyo):
  // each label tries right, left, above, then below its pin and takes the first free
  // spot. If none is free it hides; the name still shows on hover/tap via the map tooltip.
  // Visited places are placed first, "next trip?" pins after.
  function placeLabels(svg, W, H) {
    if (!svg.isConnected) return;
    const pins = [...svg.querySelectorAll(".pin:not(.next-pin)"), ...svg.querySelectorAll(".pin.next-pin")];
    const dots = pins.map((g) => {
      const c = g.querySelector("circle");
      return { x: +c.getAttribute("cx"), y: +c.getAttribute("cy"), r: 13 };
    });
    const placed = [];
    const clash = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    pins.forEach((g, i) => {
      const text = g.querySelector("text");
      if (!text) return;
      text.removeAttribute("display");
      const bb = text.getBBox();
      const w = bb.width + 4, h = bb.height;
      const { x, y } = dots[i];
      const tries = [[x + 17, y + 10, "start"], [x - 17, y + 10, "end"], [x, y - 18, "middle"], [x, y + 40, "middle"]];
      for (const [tx, ty, anchor] of tries) {
        const left = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
        const box = { x: left, y: ty - h * 0.78, w, h };
        const inside = box.x >= 0 && box.y >= 0 && box.x + w <= W && box.y + h <= H;
        const free = !placed.some((p) => clash(box, p)) &&
          !dots.some((d, j) => j !== i && clash(box, { x: d.x - d.r, y: d.y - d.r, w: 2 * d.r, h: 2 * d.r }));
        if (inside && free) {
          text.setAttribute("x", tx); text.setAttribute("y", ty); text.setAttribute("text-anchor", anchor);
          placed.push(box);
          return;
        }
      }
      text.setAttribute("display", "none");
    });
  }

  function muniName(f) {
    const n = MUNI_NAMES[f.id];
    return n ? (n[lang] || n.en) : f.properties.n;
  }
  function loadMuni() {
    if (!muniLoading) {
      muniLoading = fetch("data/municipalities.topo.json").then((r) => r.json()).then((topo) => {
        MUNI = topojson.feature(topo, topo.objects.municipalities).features;
        render();
      }).catch((e) => console.error(e));
    }
  }

  // ---------- views ----------
  function polaroidLink(info, place) {
    // Cover: the photo named in "cover", else the first real (non-test) photo.
    const photos = (place.spots || []).flatMap(spotPhotos);
    const first = (place.cover && photos.find((p) => p.src === place.cover)) ||
      photos.find((p) => !p.test) || photos[0];
    const pic = h("div", { class: "pic" });
    if (first) pic.append(h("img", { src: first.thumb || first.src, alt: "", loading: "lazy" }));
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

    const nextItems = (DATA.next || []).map((n) => {
      if (typeof n === "string") return P[n] ? h("li", {}, prefName(P[n])) : null;
      const pi = P[n.prefecture];
      return h("li", {}, loc(n.name), pi ? h("small", {}, ` · ${prefName(pi)}`) : null);
    }).filter(Boolean);

    // visited list, grouped by JIS order (north to south)
    const cards = PREFECTURES.filter(([, slug]) => visited.has(slug)).map(([, slug]) => polaroidLink(P[slug], visited.get(slug)));

    return [
      h("section", { class: "hero" }, h("h1", {}, t("title")), h("p", {}, t("subtitle"))),
      h("h2", { class: "chapter" }, t("japan")),
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

  // Names of the cities/wards colored on the map.
  function areaChips(info, place) {
    if (!MUNI) return null;
    const spots = place.spots || [];
    const areas = new Set(place.areas || []);
    const hits = MUNI.filter((f) => f.id.slice(0, 2) === info.code &&
      (areas.has(f.id) || spots.some((s) => d3.geoContains(f, [s.lon, s.lat]))));
    if (!hits.length) return null;
    return h("div", { class: "areas" },
      h("h2", {}, `${t("areasTitle")} · ${hits.length}`),
      h("ul", {}, hits.map((f) => h("li", {}, muniName(f)))));
  }

  const arrowSvg = (dir) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.setAttribute("viewBox", "0 0 24 24"); el.setAttribute("aria-hidden", "true"); el.setAttribute("class", "ico");
    el.innerHTML = dir === "left"
      ? '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    return el;
  };
  const backLink = () => h("a", { class: "back", href: "#/", "aria-label": t("back") }, arrowSvg("left"), h("span", {}, t("japan")));

  // Previous / next visited prefecture (north to south).
  function prefNav(slug) {
    const order = PREFECTURES.map((p) => p[1]).filter((s) => visited.has(s));
    const i = order.indexOf(slug);
    const prev = order[(i - 1 + order.length) % order.length], next = order[(i + 1) % order.length];
    return h("nav", { class: "pref-nav" },
      h("a", { href: `#/japan/${prev}`, class: "prev" }, arrowSvg("left"), h("span", {}, prefName(P[prev]))),
      h("a", { href: `#/japan/${next}`, class: "next" }, h("span", {}, prefName(P[next])), arrowSvg("right")));
  }

  function prefectureView(slug) {
    const info = P[slug];
    const place = visited.get(slug);
    if (!info || !place) return [backLink(), h("p", {}, t("notFound"))];

    const mapCard = h("div", { class: "map-card" });
    if (place.zoom) {
      const cur = zoomState[slug] === "all" ? "all" : "zoom";
      const btn = (mode, label) => h("button", {
        type: "button", "aria-pressed": String(cur === mode),
        onclick: () => { zoomState[slug] = mode; render(); }
      }, label);
      mapCard.append(h("div", { class: "zoom-toggle", role: "group" },
        btn("zoom", loc(place.zoomLabel) || t("zoomIn")), btn("all", t("viewAll"))));
    }
    const svg = prefectureMap(info, place);
    mapCard.append(svg);
    attachTip(mapCard, svg);

    const noteText = loc(place.note);
    const visits = placeDates(place);
    const note = h("div", { class: "note" },
      h("h2", {}, `✎ ${t("notes")}`),
      visits.length ? h("p", {}, h("strong", {}, `${t("visits")}: `), visits.map((d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDate(d) : d)).join(" · ")) : null,
      noteText ? noteText.split(/\n+/).map((para) => h("p", {}, para)) : h("p", { class: "muted" }, t("noNote")));

    const spots = place.spots || [];
    const spotSections = spots.length
      ? spots.map((s, i) => {
          // One flat list of shots per spot, so the lightbox pages through everything;
          // each card remembers where its first shot starts in that list.
          const items = spotItems(s);
          const all = [], start = new Map();
          for (const it of items) { start.set(it, all.length); all.push(...shotsOf(it)); }
          const card = (it) => {
            const first = shotsOf(it)[0], n = it.shots ? it.shots.length : 1;
            return h("button", { class: "polaroid" + (n > 1 ? " stack" : ""), type: "button", onclick: () => openLightbox(all, start.get(it)) },
              h("div", { class: "pic" },
                h("img", { src: first.thumb || first.src, alt: loc(it.caption) || loc(s.name), loading: "lazy" }),
                n > 1 ? h("span", { class: "stack-badge", "aria-label": t("photosCount", n) }, `×${n}`) : null),
              it.caption ? h("div", { class: "cap" }, loc(it.caption)) : null,
              it.credit ? h("div", { class: "sub" }, `📷 ${it.credit.author}`) : null);
          };
          const loose = items.filter((p) => !p.date);
          const blocks = [];
          if (loose.length) blocks.push(h("div", { class: "grid" }, loose.map(card)));
          for (const v of spotVisits(s)) {
            const vp = items.filter((p) => p.date === v.date);
            const count = vp.reduce((n, p) => n + (p.shots ? p.shots.length : 1), 0);
            blocks.push(h("div", { class: "visit" },
              h("h4", {}, fmtDate(v.date), count ? h("small", {}, t("photosCount", count)) : null),
              loc(v.note) ? h("p", { class: "visit-note" }, loc(v.note)) : null,
              vp.length ? h("div", { class: "grid" }, vp.map(card)) : null));
          }
          if (!blocks.length) blocks.push(h("div", { class: "grid" }, h("div", { class: "polaroid" },
            h("div", { class: "pic" }, postcard(slug + i)),
            h("div", { class: "cap" }, loc(s.name)),
            h("div", { class: "sub" }, t("photoSoon")))));
          return h("section", { class: "spot", id: `spot-${i}` },
            h("h3", {}, loc(s.name), s.name && lang !== "ja" && s.name.ja ? h("small", {}, s.name.ja) : null),
            ...blocks);
        })
      : [h("p", { class: "muted" }, t("noSpots"))];

    return [
      backLink(),
      h("div", { class: "pref-head" }, h("h1", {}, prefName(info)), h("div", { class: "alt" }, `${prefAlt(info)} · ${t("regions")[info.region]}`)),
      h("div", { class: "pref-layout" }, mapCard, h("div", {}, note, areaChips(info, place))),
      h("h2", { class: "section-title" }, t("spots")),
      ...spotSections,
      visited.size > 1 ? prefNav(slug) : null
    ].filter(Boolean);
  }

  // ---------- lightbox ----------
  const lb = h("div", { class: "lightbox", role: "dialog", "aria-modal": "true" });
  const lbImg = h("img", { alt: "" });
  const lbCap = h("p");
  const lbCredit = h("a", { class: "lb-credit", target: "_blank", rel: "noopener" });
  const lbClose = h("button", { type: "button", class: "lb-close", "aria-label": "Close" }, "×");
  const lbPrev = h("button", { type: "button", class: "lb-nav prev" }, arrowSvg("left"));
  const lbNext = h("button", { type: "button", class: "lb-nav next" }, arrowSvg("right"));
  const lbCount = h("span", { class: "lb-count" });
  lb.append(lbClose, lbPrev, lbNext, lbImg, lbCap, lbCount, lbCredit);
  document.body.append(lb);
  let lbList = [], lbIndex = 0;
  const closeLb = () => { lb.classList.remove("open"); lbImg.src = ""; };
  const step = (d) => { if (lbList.length > 1) showLb((lbIndex + d + lbList.length) % lbList.length); };
  lbPrev.addEventListener("click", () => step(-1));
  lbNext.addEventListener("click", () => step(1));
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target === lbClose) closeLb(); });
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") closeLb();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
  // Swipe left/right on phones.
  let touchX = null;
  lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  });
  function showLb(i) {
    lbIndex = i;
    const ph = lbList[i];
    lbImg.src = ph.src;
    lbImg.alt = loc(ph.caption);
    lbCap.textContent = [loc(ph.caption), ph.of ? `${ph.shot}/${ph.of}` : "", ph.date ? fmtDate(ph.date) : ""].filter(Boolean).join(" · ");
    const multi = lbList.length > 1;
    lbPrev.hidden = lbNext.hidden = lbCount.hidden = !multi;
    lbPrev.setAttribute("aria-label", t("photoPrev"));
    lbNext.setAttribute("aria-label", t("photoNext"));
    lbCount.textContent = `${i + 1} / ${lbList.length}`;
    const c = ph.credit;
    lbCredit.hidden = !c;
    if (c) { lbCredit.textContent = `📷 ${c.author} · ${c.license}`; lbCredit.href = c.url; }
  }
  function openLightbox(list, i) {
    lbList = list; showLb(Math.max(0, i));
    lb.classList.add("open");
  }

  // ---------- routing ----------
  function go(slug) { location.hash = `#/japan/${slug}`; }
  function route() {
    const m = location.hash.match(/^#\/japan\/([a-z]+)/);
    return m ? { view: "pref", slug: m[1] } : { view: "home" };
  }
  let lastRoute = "";
  const zoomState = {}; // slug -> "all" | "zoom" (for prefectures with a zoomed view)
  function render() {
    applyStatic();
    if (!DATA) return;
    const r = route();
    if (r.view === "pref" && !MUNI) loadMuni();
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
    for (const s of data.next || []) {
      if (typeof s === "string") nextSet.add(s);
      else if (s && typeof s.lat === "number") nextSpots.push(s);
    }
    render();
  }).catch((err) => {
    app.replaceChildren(h("p", { class: "muted" }, "Could not load the map data."));
    console.error(err);
  });
})();
