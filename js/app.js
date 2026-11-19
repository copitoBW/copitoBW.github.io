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
  // Region visit dates: written by hand, or collected from the spots' visits.
  const placeDates = (place) => {
    if (place.visits && place.visits.length) return place.visits;
    const set = new Set((place.spots || []).flatMap((s) => (s.visits || []).map((v) => v.date)));
    return [...set].sort();
  };
  // Cover: the photo named in "cover", else the first real (non-test) photo.
  const coverOf = (photos, cover) =>
    (cover && photos.find((p) => p.src === cover)) || photos.find((p) => !p.test) || photos[0];

  // ---------- countries and their regions ----------
  // C[slug] = { ...config, R: slug -> region, byCode: code -> region,
  //             data, visited: Map(regionSlug -> place), nextSet, nextSpots, features, muni }
  const C = {};
  for (const cfg of COUNTRIES) {
    // cfg.data is the album file's path; c.data becomes its loaded contents.
    const c = { ...cfg, dataFile: cfg.data, R: {}, byCode: {}, data: null, visited: new Map(), nextSet: new Set(), nextSpots: [], features: null };
    for (const [code, slug, en, ja, es, group] of cfg.regions) {
      const info = { code, slug, names: { en, ja, es }, group };
      c.R[slug] = info; c.byCode[code] = info;
    }
    C[cfg.slug] = c;
  }
  const regionName = (info) => info.names[lang] || info.names.en;
  const regionAlt = (info) => (lang === "ja" ? info.names.en : info.names.ja);
  const countryName = (c) => loc(c.names);
  const unit = (c, plural) => (c.unit[lang] || c.unit.en)[plural ? 1 : 0];
  const groupName = (c, i) => (c.groups[lang] || c.groups.en)[i];
  const regionOf = (p) => p.region || p.prefecture; // Japan's file says "prefecture"

  function setData(c, data) {
    c.data = data;
    for (const p of data.places || []) if (c.R[regionOf(p)]) c.visited.set(regionOf(p), p);
    for (const s of data.next || []) {
      if (typeof s === "string") c.nextSet.add(s);
      else if (s && typeof s.lat === "number") c.nextSpots.push(s);
    }
  }

  // Region shapes load the first time a country is opened.
  const mapLoading = {};
  function loadMap(c) {
    if (!mapLoading[c.slug]) {
      mapLoading[c.slug] = fetch(c.map.file).then((r) => r.json()).then((geo) => {
        const feats = c.map.object ? topojson.feature(geo, geo.objects[c.map.object]).features : geo.features;
        c.features = {};
        for (const f of feats) c.features[f.id] = f;
        render();
      }).catch((e) => console.error(e));
    }
  }
  // Japan's city/ward layer, loaded on the first Japanese region page.
  let MUNI = null, muniLoading = null;
  function loadMuni() {
    if (!muniLoading) {
      muniLoading = fetch("data/municipalities.topo.json").then((r) => r.json()).then((topo) => {
        MUNI = topojson.feature(topo, topo.objects.municipalities).features;
        render();
      }).catch((e) => console.error(e));
    }
  }
  function muniName(f) {
    const n = MUNI_NAMES[f.id];
    return n ? (n[lang] || n.en) : f.properties.n;
  }

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

  // Every map shape carries its own name in data-name, so the tooltip just reads it.
  function attachTip(card, svg) {
    const tip = h("div", { class: "map-tip" });
    card.append(tip);
    svg.addEventListener("pointermove", (e) => {
      const text = (e.target.dataset || {}).name || "";
      if (!text) { tip.style.opacity = "0"; return; }
      const r = card.getBoundingClientRect();
      tip.textContent = text;
      tip.style.left = `${e.clientX - r.left}px`;
      tip.style.top = `${e.clientY - r.top}px`;
      tip.style.opacity = "1";
    });
    svg.addEventListener("pointerleave", () => { tip.style.opacity = "0"; });
  }

  // The polygons of a shape, dropping specks smaller than minShare of its largest part.
  function mainPolys(geometry, minShare) {
    const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    const areas = polys.map((p) => d3.geoArea({ type: "Polygon", coordinates: p }));
    const max = Math.max(...areas);
    return polys.filter((_, i) => areas[i] >= max * minShare);
  }
  // Bounds that ignore tiny far-off islands (so Tokyo isn't zoomed out to Ogasawara).
  function focusShape(feature, spots, minShare = 0.15) {
    const geoms = [{ type: "MultiPolygon", coordinates: mainPolys(feature.geometry, minShare) }];
    if (spots.length) geoms.push({ type: "MultiPoint", coordinates: spots.map((s) => [s.lon, s.lat]) });
    return { type: "GeometryCollection", geometries: geoms };
  }

  // A whole country, regions colored by visited / next trip / not yet.
  function countryMap(c) {
    const [W, H] = c.size;
    const feats = Object.values(c.features);
    let fit;
    if (c.extent) fit = { type: "MultiPoint", coordinates: c.extent };
    else {
      // Fit the mainland: skip regions' tiny islands so the map isn't mostly sea.
      const polys = feats.filter((f) => f.id !== c.inset).flatMap((f) => mainPolys(f.geometry, 0.05));
      fit = { type: "MultiPolygon", coordinates: polys };
    }
    const main = d3.geoMercator().fitExtent([[18, 18], [W - 18, H - 18]], fit);
    const pathMain = d3.geoPath(main);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": countryName(c) });

    let pathInset = null;
    if (c.inset && c.features[c.inset]) {
      const inset = d3.geoMercator().fitExtent([[36, 62], [296, 262]], focusShape(c.features[c.inset], [], 0.05));
      pathInset = d3.geoPath(inset);
      svg.append(svgEl("rect", { class: "inset-box", x: 22, y: 22, width: 290, height: 254, rx: 8 }));
      const lbl = svgEl("text", { class: "inset-label", x: 36, y: 52 });
      lbl.textContent = regionName(c.byCode[c.inset]);
      svg.append(lbl);
    }

    for (const f of feats) {
      const info = c.byCode[f.id];
      if (!info) continue;
      const isVisited = c.visited.has(info.slug);
      const d = (f.id === c.inset && pathInset ? pathInset : pathMain)(f);
      const cls = "pref" + (isVisited ? " visited" : c.nextSet.has(info.slug) ? " next" : "");
      const p = svgEl("path", { d, class: cls, "data-name": regionName(info) });
      const title = svgEl("title");
      title.textContent = regionName(info);
      p.append(title);
      if (isVisited) {
        p.setAttribute("tabindex", "0");
        p.setAttribute("role", "link");
        p.setAttribute("aria-label", regionName(info));
        p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(c, info.slug); } });
      }
      p.addEventListener("click", () => (isVisited ? go(c, info.slug) : toast(`${regionName(info)} — ${t("notYet")}`)));
      svg.append(p);
    }
    return svg;
  }

  // One region, with its neighbours faded, (for Japan) its cities/wards, and the place pins.
  function regionMap(c, info, place) {
    const W = 600, H = 520;
    const spots = place.spots || [];
    const muni = c.municipalities ? MUNI : null;
    const zoomKey = `${c.slug}/${info.slug}`;
    const zoomed = place.zoom && zoomState[zoomKey] !== "all";
    const zoomTo = zoomed && muni ? muni.filter((f) => f.id.startsWith(place.zoom)) : null;
    const fitShape = zoomTo && zoomTo.length
      ? { type: "FeatureCollection", features: zoomTo }
      : focusShape(c.features[info.code], spots);
    const proj = d3.geoMercator().fitExtent([[40, 40], [W - 40, H - 40]], fitShape);
    const path = d3.geoPath(proj);
    const nexts = c.nextSpots.filter((n) => regionOf(n) === info.slug);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": regionName(info) });

    for (const [code, f] of Object.entries(c.features)) {
      if (code === info.code) continue;
      const other = c.byCode[code];
      svg.append(svgEl("path", { d: path(f), class: "pref context", "data-name": other ? regionName(other) : "" }));
    }
    svg.append(svgEl("path", { d: path(c.features[info.code]), class: "pref focus", "data-name": regionName(info) }));

    if (muni) {
      const areas = new Set(place.areas || []);
      for (const f of muni) {
        if (f.id.slice(0, 2) !== info.code) continue;
        const hit = areas.has(f.id) || spots.some((s) => d3.geoContains(f, [s.lon, s.lat]));
        svg.append(svgEl("path", { d: path(f), class: "muni" + (hit ? " visited" : ""), "data-name": muniName(f) }));
      }
    }

    nexts.forEach((s) => {
      const [x, y] = proj([s.lon, s.lat]);
      const g = svgEl("g", { class: "pin next-pin" });
      g.append(svgEl("circle", { cx: x, cy: y, r: 11, "data-name": `${loc(s.name)}?` }));
      const label = svgEl("text", { x: x + 17, y: y + 10 });
      label.textContent = `${loc(s.name)}?`;
      g.append(label);
      svg.append(g);
    });

    spots.forEach((s, i) => {
      const [x, y] = proj([s.lon, s.lat]);
      const g = svgEl("g", { class: "pin", tabindex: "0", role: "link", "aria-label": loc(s.name) });
      g.append(svgEl("circle", { cx: x, cy: y, r: 11, "data-name": loc(s.name) }));
      const label = svgEl("text", { x: x + 17, y: y + 10 });
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

  // ---------- shared bits ----------
  const arrowSvg = (dir) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.setAttribute("viewBox", "0 0 24 24"); el.setAttribute("aria-hidden", "true"); el.setAttribute("class", "ico");
    el.innerHTML = dir === "left"
      ? '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    return el;
  };
  const backLink = (href, label) => h("a", { class: "back", href, "aria-label": t("backTo", label) }, arrowSvg("left"), h("span", {}, label));
  const loading = () => h("p", { class: "muted" }, t("loading"));
  const progressBar = (n, total) => {
    const bar = h("div", { class: "bar" }, h("span", { style: "width:0" }));
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.firstChild.style.width = `${(n / total) * 100}%`; }));
    return bar;
  };
  const countryPhotos = (c) => [...c.visited.values()].flatMap((p) => (p.spots || []).flatMap(spotPhotos));

  // ---------- views ----------
  // Home: every country as a card.
  function homeView() {
    const all = Object.values(C);
    const withPlaces = all.filter((c) => c.visited.size);
    const placeCount = withPlaces.reduce((n, c) => n + [...c.visited.values()].reduce((m, p) => m + (p.spots || []).length, 0), 0);
    const photoCount = withPlaces.reduce((n, c) => n + countryPhotos(c).filter((p) => !p.test).length, 0);

    const cards = all.map((c) => {
      const cover = coverOf(countryPhotos(c), c.data.cover);
      const pic = h("div", { class: "pic" });
      if (cover) pic.append(h("img", { src: cover.thumb || cover.src, alt: "", loading: "lazy" }));
      else pic.append(postcard(c.slug));
      const sub = c.visited.size
        ? t("regionCount", c.visited.size, c.regions.length, unit(c, true))
        : t("photosSoonCountry");
      return h("a", { class: "polaroid", href: `#/${c.slug}` },
        pic, h("div", { class: "cap" }, countryName(c)), h("div", { class: "sub" }, sub));
    });

    return [
      h("section", { class: "hero" }, h("h1", {}, t("title")), h("p", {}, t("subtitle"))),
      h("p", { class: "stats" }, t("stats", withPlaces.length, placeCount, photoCount)),
      h("h2", { class: "section-title" }, t("countriesTitle")),
      h("div", { class: "grid countries" }, cards)
    ];
  }

  function regionCard(c, info, place) {
    const cover = coverOf((place.spots || []).flatMap(spotPhotos), place.cover);
    const pic = h("div", { class: "pic" });
    if (cover) pic.append(h("img", { src: cover.thumb || cover.src, alt: "", loading: "lazy" }));
    else pic.append(postcard(info.slug));
    const n = (place.spots || []).length;
    return h("a", { class: "polaroid", href: `#/${c.slug}/${info.slug}` },
      pic,
      h("div", { class: "cap" }, regionName(info)),
      h("div", { class: "sub" }, n ? t("spotsCount", n) : regionAlt(info)));
  }

  // A country: its map, progress, next trips and region albums.
  function countryView(c) {
    const head = [
      backLink("#/", t("allCountries")),
      h("h1", { class: "chapter" }, countryName(c))
    ];
    if (!c.features) { loadMap(c); return [...head, loading()]; }

    const total = c.regions.length;
    const n = c.visited.size;
    const card = h("div", { class: "map-card" });
    const svg = countryMap(c);
    card.append(svg);
    attachTip(card, svg);

    const legend = h("div", { class: "legend" },
      h("span", {}, h("i", { style: "background:var(--visited)" }), t("legendVisited")),
      h("span", {}, h("i", { style: "background:var(--next)" }), t("legendNext")),
      h("span", {}, h("i", { style: "background:var(--none)" }), t("legendNone")));

    const nextItems = (c.data.next || []).map((x) => {
      if (typeof x === "string") return c.R[x] ? h("li", {}, regionName(c.R[x])) : null;
      const pi = c.R[regionOf(x)];
      return h("li", {}, loc(x.name), pi ? h("small", {}, ` · ${regionName(pi)}`) : null);
    }).filter(Boolean);

    // Region albums in the country's own order (Japan: north to south).
    const cards = c.regions.filter(([, slug]) => c.visited.has(slug)).map(([, slug]) => regionCard(c, c.R[slug], c.visited.get(slug)));

    return [
      ...head,
      h("div", { class: "counter" }, h("strong", {}, t("counter", n, total, unit(c, true))), progressBar(n, total)),
      card,
      legend,
      n ? h("p", { class: "hint" }, t("tapHint", unit(c, false))) : null,
      nextItems.length ? h("h2", { class: "section-title" }, t("nextTitle")) : null,
      nextItems.length ? h("div", { class: "next-card" }, h("ul", { class: "next-list" }, nextItems)) : null,
      h("h2", { class: "section-title" }, t("visitedTitle", unit(c, true))),
      cards.length ? h("div", { class: "grid" }, cards) : h("p", { class: "muted" }, t("photosSoonCountry"))
    ].filter(Boolean);
  }

  // Names of the cities/wards colored on the map (Japan only).
  function areaChips(c, info, place) {
    if (!c.municipalities || !MUNI) return null;
    const spots = place.spots || [];
    const areas = new Set(place.areas || []);
    const hits = MUNI.filter((f) => f.id.slice(0, 2) === info.code &&
      (areas.has(f.id) || spots.some((s) => d3.geoContains(f, [s.lon, s.lat]))));
    if (!hits.length) return null;
    return h("div", { class: "areas" },
      h("h2", {}, `${t("areasTitle")} · ${hits.length}`),
      h("ul", {}, hits.map((f) => h("li", {}, muniName(f)))));
  }

  // Previous / next visited region in the same country.
  function regionNav(c, slug) {
    const order = c.regions.map((r) => r[1]).filter((s) => c.visited.has(s));
    const i = order.indexOf(slug);
    const prev = order[(i - 1 + order.length) % order.length], next = order[(i + 1) % order.length];
    return h("nav", { class: "pref-nav" },
      // With only two regions, "previous" and "next" are the same one: show it once.
      prev === next ? h("span") : h("a", { href: `#/${c.slug}/${prev}`, class: "prev" }, arrowSvg("left"), h("span", {}, regionName(c.R[prev]))),
      h("a", { href: `#/${c.slug}/${next}`, class: "next" }, h("span", {}, regionName(c.R[next])), arrowSvg("right")));
  }

  function regionView(c, slug) {
    const info = c.R[slug];
    const place = c.visited.get(slug);
    const back = backLink(`#/${c.slug}`, countryName(c));
    if (!info || !place) return [back, h("p", {}, t("notFound"))];
    if (!c.features) { loadMap(c); return [back, loading()]; }
    if (c.municipalities && !MUNI) loadMuni();

    const mapCard = h("div", { class: "map-card" });
    if (place.zoom) {
      const key = `${c.slug}/${slug}`;
      const cur = zoomState[key] === "all" ? "all" : "zoom";
      const btn = (mode, label) => h("button", {
        type: "button", "aria-pressed": String(cur === mode),
        onclick: () => { zoomState[key] = mode; render(); }
      }, label);
      mapCard.append(h("div", { class: "zoom-toggle", role: "group" },
        btn("zoom", loc(place.zoomLabel) || t("zoomIn")), btn("all", t("viewAll"))));
    }
    const svg = regionMap(c, info, place);
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
      back,
      h("div", { class: "pref-head" }, h("h1", {}, regionName(info)), h("div", { class: "alt" }, `${regionAlt(info)} · ${groupName(c, info.group)}`)),
      h("div", { class: "pref-layout" }, mapCard, h("div", {}, note, areaChips(c, info, place))),
      h("h2", { class: "section-title" }, t("spots")),
      ...spotSections,
      c.visited.size > 1 ? regionNav(c, slug) : null
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
  // #/                    home (all countries)
  // #/japan               a country
  // #/japan/tokyo         a region of that country
  function go(c, slug) { location.hash = `#/${c.slug}/${slug}`; }
  function route() {
    const m = location.hash.match(/^#\/([a-z]+)(?:\/([a-z-]+))?/);
    if (!m || !C[m[1]]) return { view: "home" };
    return m[2] ? { view: "region", c: C[m[1]], slug: m[2] } : { view: "country", c: C[m[1]] };
  }
  let lastRoute = "";
  const zoomState = {}; // "country/region" -> "all" | "zoom" (for regions with a zoomed view)
  function render() {
    applyStatic();
    if (!loaded) return;
    const r = route();
    const view = r.view === "region" ? regionView(r.c, r.slug) : r.view === "country" ? countryView(r.c) : homeView();
    app.replaceChildren(...view);
    const key = location.hash;
    if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
    const info = r.view === "region" ? r.c.R[r.slug] : null;
    document.title = info ? `${regionName(info)} · ${t("title")}`
      : r.view === "country" ? `${countryName(r.c)} · ${t("title")}` : t("title");
  }
  window.addEventListener("hashchange", render);

  // ---------- load ----------
  // Every country's album file is small, so they all load up front (the home page
  // needs their counts and covers). The maps load only when a country is opened.
  let loaded = false;
  applyStatic();
  Promise.all(Object.values(C).map((c) => fetch(c.dataFile).then((r) => r.json()).then((d) => setData(c, d))))
    .then(() => { loaded = true; render(); })
    .catch((err) => {
      app.replaceChildren(h("p", { class: "muted" }, "Could not load the diary."));
      console.error(err);
    });
})();
