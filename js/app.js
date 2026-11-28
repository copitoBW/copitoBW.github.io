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

  // ---------- mobile menu ----------
  const menuBtn = document.getElementById("menuBtn");
  const siteNav = document.getElementById("siteNav");
  function closeMenu() {
    if (!menuBtn || !siteNav) return;
    siteNav.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }
  if (menuBtn && siteNav) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !siteNav.classList.contains("open");
      siteNav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    siteNav.addEventListener("click", (e) => {
      if (e.target.closest("a")) closeMenu();
    });
    document.addEventListener("click", (e) => {
      if (siteNav.classList.contains("open") && !e.target.closest(".topbar")) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && siteNav.classList.contains("open")) closeMenu();
    });
  }

  // On small screens the language switch moves into the drawer to free the top bar.
  const langBox = document.querySelector(".lang");
  const controlsBox = document.querySelector(".controls");
  if (siteNav && langBox && controlsBox && window.matchMedia) {
    const mq = window.matchMedia("(max-width: 820px)");
    const placeLang = () => { if (mq.matches) siteNav.append(langBox); else controlsBox.prepend(langBox); };
    mq.addEventListener("change", placeLang);
    placeLang();
  }

  function applyStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    themeBtn.setAttribute("aria-label", t("theme"));
    themeBtn.title = t("theme");
    document.querySelector(".lang").setAttribute("aria-label", t("language"));
    if (siteNav) siteNav.setAttribute("aria-label", t("navLabel"));
    if (menuBtn) { menuBtn.setAttribute("aria-label", t("navMenu")); menuBtn.title = t("navMenu"); }
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
    // Shapes live in one layer that is scaled when zooming; pins sit on top and
    // are only moved, so dots and labels keep their size at any zoom.
    const layer = svgEl("g", { class: "zoom-layer" });
    svg.append(layer);

    for (const [code, f] of Object.entries(c.features)) {
      if (code === info.code) continue;
      const other = c.byCode[code];
      layer.append(svgEl("path", { d: path(f), class: "pref context", "data-name": other ? regionName(other) : "" }));
    }
    layer.append(svgEl("path", { d: path(c.features[info.code]), class: "pref focus", "data-name": regionName(info) }));

    if (muni) {
      const areas = new Set(place.areas || []);
      for (const f of muni) {
        if (f.id.slice(0, 2) !== info.code) continue;
        const hit = areas.has(f.id) || spots.some((s) => d3.geoContains(f, [s.lon, s.lat]));
        layer.append(svgEl("path", { d: path(f), class: "muni" + (hit ? " visited" : ""), "data-name": muniName(f) }));
      }
    }

    nexts.forEach((s) => {
      const [x, y] = proj([s.lon, s.lat]);
      const g = svgEl("g", { class: "pin next-pin", "data-x": x, "data-y": y });
      g.append(svgEl("circle", { cx: x, cy: y, r: 11, "data-name": `${loc(s.name)}?` }));
      const label = svgEl("text", { x: x + 17, y: y + 10 });
      label.textContent = `${loc(s.name)}?`;
      g.append(label);
      svg.append(g);
    });

    spots.forEach((s, i) => {
      const [x, y] = proj([s.lon, s.lat]);
      const g = svgEl("g", { class: "pin", tabindex: "0", role: "link", "aria-label": loc(s.name), "data-x": x, "data-y": y });
      g.append(svgEl("circle", { cx: x, cy: y, r: 11, "data-name": loc(s.name) }));
      const label = svgEl("text", { x: x + 17, y: y + 10 });
      label.textContent = loc(s.name);
      g.append(label);
      const jump = () => document.getElementById(`spot-${i}`)?.scrollIntoView({ behavior: "smooth" });
      g.addEventListener("click", jump);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter") jump(); });
      svg.append(g);
    });
    enableZoom(svg, layer, W, H, `${c.slug}/${info.slug}`);
    // Labels can only be measured once the map is on the page (and again once the font loads).
    if (document.fonts) document.fonts.ready.then(() => placeLabels(svg, W, H));
    return svg;
  }

  // ---------- zoom and pan (region maps) ----------
  // Mouse: wheel or double-click to zoom, drag to move. Touch: pinch to zoom,
  // drag to move once zoomed in (at full view one finger still scrolls the page).
  // Buttons call svg.zoomApi. The view is remembered per region during the visit.
  const zoomView = {}; // "country/region" -> { k, x, y }
  const MAX_ZOOM = 16;
  function enableZoom(svg, layer, W, H, key) {
    const st = zoomView[key] || (zoomView[key] = { k: 1, x: 0, y: 0 });
    const pins = [...svg.querySelectorAll(".pin")];
    let raf = 0;
    const apply = () => {
      st.k = Math.min(MAX_ZOOM, Math.max(1, st.k));
      st.x = Math.min(0, Math.max(W - W * st.k, st.x));
      st.y = Math.min(0, Math.max(H - H * st.k, st.y));
      layer.setAttribute("transform", `translate(${st.x} ${st.y}) scale(${st.k})`);
      for (const g of pins) {
        const x = st.x + st.k * +g.dataset.x, y = st.y + st.k * +g.dataset.y;
        const circle = g.querySelector("circle");
        circle.setAttribute("cx", x); circle.setAttribute("cy", y);
      }
      svg.classList.toggle("zoomed", st.k > 1);
      svg.style.touchAction = st.k > 1 ? "none" : "pan-y";
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => placeLabels(svg, W, H));
    };
    const toSvg = (cx, cy) => {
      const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    const zoomAt = (factor, px, py) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, st.k * factor));
      const r = k / st.k;
      st.x = px - (px - st.x) * r; st.y = py - (py - st.y) * r; st.k = k;
      apply();
    };
    svg.zoomApi = {
      by: (f) => zoomAt(f, W / 2, H / 2),
      reset: () => { st.k = 1; st.x = 0; st.y = 0; apply(); }
    };

    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(Math.exp(-e.deltaY * 0.002), p.x, p.y);
    }, { passive: false });
    svg.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(2, p.x, p.y);
    });

    // Dragging and pinching. Listening on window keeps the drag going outside the map;
    // the listeners remove themselves once this map is no longer on the page.
    const ptrs = new Map();
    let moved = 0, pinchDist = 0;
    const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    svg.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) moved = 0;
      if (ptrs.size === 2) pinchDist = dist();
    });
    const onMove = (e) => {
      if (!svg.isConnected) return cleanup();
      const prev = ptrs.get(e.pointerId);
      if (!prev) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        const d = dist(), [a, b] = [...ptrs.values()];
        const p = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (pinchDist) zoomAt(d / pinchDist, p.x, p.y);
        pinchDist = d; moved += 10;
        e.preventDefault();
      } else if (st.k > 1) {
        const s = W / svg.getBoundingClientRect().width;
        const dx = (e.clientX - prev.x) * s, dy = (e.clientY - prev.y) * s;
        moved += Math.abs(dx) + Math.abs(dy);
        st.x += dx; st.y += dy;
        apply();
      }
    };
    const onUp = (e) => {
      if (!svg.isConnected) return cleanup();
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinchDist = 0;
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // A drag that ends on a pin should not count as a click on it.
    svg.addEventListener("click", (e) => { if (moved > 6) { e.stopPropagation(); e.preventDefault(); } }, true);
    apply();
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
  function chapterArt(kind) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 160 100");
    svg.setAttribute("aria-hidden", "true");
    if (kind === "music") {
      svg.innerHTML =
        '<rect width="160" height="100" fill="var(--paper-2)"/>' +
        '<g stroke="var(--line)" stroke-width="1" opacity=".55">' +
        '<path d="M0 18h160M0 24h160M0 30h160M0 36h160M0 42h160"/>' +
        '<path d="M0 64h160M0 70h160M0 76h160M0 82h160M0 88h160"/></g>' +
        '<rect x="30" y="19" width="100" height="62" rx="7" fill="var(--ink)" opacity=".92"/>' +
        '<rect x="38" y="25" width="84" height="33" rx="3" fill="var(--card)"/>' +
        '<rect x="38" y="25" width="84" height="9" rx="3" fill="var(--accent)"/>' +
        '<rect x="52" y="40" width="56" height="14" rx="7" fill="var(--paper-2)" stroke="var(--line)"/>' +
        '<circle cx="63" cy="47" r="5" fill="var(--ink)"/><circle cx="63" cy="47" r="2" fill="var(--card)"/>' +
        '<circle cx="97" cy="47" r="5" fill="var(--ink)"/><circle cx="97" cy="47" r="2" fill="var(--card)"/>' +
        '<path d="M52 74l5-10h46l5 10z" fill="var(--paper-2)" opacity=".28"/>';
    } else {
      svg.innerHTML =
        '<rect width="160" height="100" fill="var(--paper-2)"/>' +
        '<rect x="34" y="16" width="92" height="68" rx="4" fill="var(--card)" stroke="var(--line)" stroke-width="1.5"/>' +
        '<line x1="80" y1="16" x2="80" y2="84" stroke="var(--line)" stroke-width="1.5"/>' +
        '<path d="M84 16h8v20l-4-3.5-4 3.5z" fill="var(--accent)"/>' +
        '<g stroke="var(--line)" stroke-width="1.5" stroke-linecap="round">' +
        '<path d="M44 31h26M44 41h26M44 51h20M44 61h24"/>' +
        '<path d="M90 44h26M90 54h26M90 64h18"/></g>' +
        '<circle cx="57" cy="72" r="5" fill="var(--next)" opacity=".85"/>' +
        '<path d="M114 26l12-12 5 5-12 12-6 1z" fill="var(--pin)"/>';
    }
    return svg;
  }

  // The newest pages across trips, food and events, for the home page.
  const isoDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  const fmtShort = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(LOCALES[lang], { year: "numeric", month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
  };
  function recentItems(limit) {
    const items = [];
    for (const c of Object.values(C)) {
      for (const [slug, place] of c.visited) {
        const photos = (place.spots || []).flatMap(spotPhotos).filter((p) => !p.test && isoDay(p.date));
        if (!photos.length) continue;
        const last = photos.reduce((x, y) => (y.date > x.date ? y : x));
        items.push({ date: last.date, photo: last, title: regionName(c.R[slug]), kind: t("navTrips"), href: `#/trips/${c.slug}/${slug}` });
      }
    }
    const add = (list, kind, href, titleOf) => {
      for (const e of list || []) {
        const photo = (e.photos || []).flatMap(shotsOf)[0];
        if (photo && isoDay(e.date)) items.push({ date: e.date, photo, title: titleOf(e), kind, href });
      }
    };
    if (FOOD) add(FOOD.entries, t("navFood"), "#/food", (e) => loc(e.dish) || loc(e.shop));
    if (EVENTS) add(EVENTS.entries, t("navEvents"), "#/events", (e) => loc(e.title));
    return items.sort((x, y) => y.date.localeCompare(x.date)).slice(0, limit);
  }
  const musicReady = () => !!(MUSIC && !MUSIC.draft && ((MUSIC.onRepeat || []).length || (MUSIC.playlists || []).length));

  // Home: the diary's cover — a greeting, the newest pages, then one card per chapter.
  function homeView() {
    if (!FOOD) loadFood();
    if (!EVENTS) loadEvents();
    const all = Object.values(C);
    const withPlaces = all.filter((c) => c.visited.size);
    const placeCount = withPlaces.reduce((n, c) => n + [...c.visited.values()].reduce((m, p) => m + (p.spots || []).length, 0), 0);
    const photoCount = withPlaces.reduce((n, c) => n + countryPhotos(c).filter((p) => !p.test).length, 0);

    const byDate = (list) => (list || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const photosIn = (list) => list.reduce((n, e) => n + (e.photos || []).flatMap(shotsOf).length, 0);
    const firstPhoto = (list) => { const e = list.find((x) => (x.photos || []).length); return e ? shotsOf(e.photos[0])[0] : null; };
    const tripsCover = C.japan ? coverOf(countryPhotos(C.japan), C.japan.data.cover) : null;
    const foodEntries = FOOD ? byDate(FOOD.entries) : [];
    const eventEntries = EVENTS ? byDate(EVENTS.entries) : [];

    const chapterCard = ({ href, kind, title, desc, meta, cover, art }) => {
      const pic = h("div", { class: "pic" });
      if (cover) pic.append(h("img", { src: cover.thumb || cover.src, alt: "", loading: "lazy" }));
      else if (art) pic.append(art);
      else pic.append(postcard(kind));
      return h("a", { class: `chapter-card chapter-${kind}`, href },
        pic,
        h("div", { class: "chapter-body" },
          h("h3", {}, title),
          h("p", {}, desc),
          h("div", { class: "chapter-foot" },
            h("span", { class: "chapter-meta" }, meta || ""),
            h("span", { class: "chapter-go" }, arrowSvg("right")))));
    };

    const recent = recentItems(6);
    const chapters = [
      chapterCard({
        href: "#/trips", kind: "trips", title: t("tripsTitle"), desc: t("homeTripsDesc"),
        meta: t("stats", withPlaces.length, placeCount, photoCount), cover: tripsCover
      }),
      chapterCard({
        href: "#/food", kind: "food", title: t("foodTitle"), desc: t("homeFoodDesc"),
        meta: foodEntries.length ? t("foodStats", foodEntries.length, photosIn(foodEntries)) : "", cover: firstPhoto(foodEntries)
      }),
      chapterCard({
        href: "#/events", kind: "events", title: t("eventsTitle"), desc: t("homeEventsDesc"),
        meta: eventEntries.length ? t("eventsStats", eventEntries.length, photosIn(eventEntries)) : "", cover: firstPhoto(eventEntries)
      }),
      musicReady() ? chapterCard({
        href: "#/music", kind: "music", title: t("musicTitle"), desc: t("homeMusicDesc"),
        meta: (MUSIC.onRepeat || []).length ? t("musicStats", MUSIC.onRepeat.length, (MUSIC.playlists || []).length) : "", art: chapterArt("music")
      }) : null
    ].filter(Boolean);

    return [
      h("section", { class: "hero home-hero" },
        h("h1", {}, t("title")),
        h("p", {}, t("homeGreeting")),
        h("p", { class: "home-about" }, h("a", { href: "#/about" }, t("aboutTitle"), arrowSvg("right")))),
      recent.length ? h("h2", { class: "section-title" }, t("homeRecent")) : null,
      recent.length ? h("div", { class: "grid recent" }, recent.map((it) =>
        h("a", { class: "polaroid", href: it.href },
          h("div", { class: "pic" }, h("img", { src: it.photo.thumb || it.photo.src, alt: "", loading: "lazy" })),
          h("div", { class: "cap" }, it.title),
          h("div", { class: "sub" }, `${it.kind} · ${fmtShort(it.date)}`)))) : null,
      h("h2", { class: "section-title" }, t("homeChapters")),
      h("div", { class: "chapter-grid" }, chapters)
    ].filter(Boolean);
  }

  // Trips: every country as a card.
  function tripsView() {
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
      return h("a", { class: "polaroid", href: `#/trips/${c.slug}` },
        pic, h("div", { class: "cap" }, countryName(c)), h("div", { class: "sub" }, sub));
    });

    return [
      h("section", { class: "hero" }, h("h1", {}, t("tripsTitle")), h("p", {}, t("tripsSubtitle"))),
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
    return h("a", { class: "polaroid", href: `#/trips/${c.slug}/${info.slug}` },
      pic,
      h("div", { class: "cap" }, regionName(info)),
      h("div", { class: "sub" }, n ? t("spotsCount", n) : regionAlt(info)));
  }

  // A country: its map, progress, next trips and region albums.
  function countryView(c) {
    const head = [
      backLink("#/trips", t("allCountries")),
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
      prev === next ? h("span") : h("a", { href: `#/trips/${c.slug}/${prev}`, class: "prev" }, arrowSvg("left"), h("span", {}, regionName(c.R[prev]))),
      h("a", { href: `#/trips/${c.slug}/${next}`, class: "next" }, h("span", {}, regionName(c.R[next])), arrowSvg("right")));
  }

  function regionView(c, slug) {
    const info = c.R[slug];
    const place = c.visited.get(slug);
    const back = backLink(`#/trips/${c.slug}`, countryName(c));
    if (!info || !place) return [back, h("p", {}, t("notFound"))];
    if (!c.features) { loadMap(c); return [back, loading()]; }
    if (c.municipalities && !MUNI) loadMuni();

    const mapCard = h("div", { class: "map-card" });
    if (place.zoom) {
      const key = `${c.slug}/${slug}`;
      const cur = zoomState[key] === "all" ? "all" : "zoom";
      const btn = (mode, label) => h("button", {
        type: "button", "aria-pressed": String(cur === mode),
        onclick: () => { zoomState[key] = mode; delete zoomView[key]; render(); }
      }, label);
      mapCard.append(h("div", { class: "zoom-toggle", role: "group" },
        btn("zoom", loc(place.zoomLabel) || t("zoomIn")), btn("all", t("viewAll"))));
    }
    const svg = regionMap(c, info, place);
    mapCard.append(svg);
    attachTip(mapCard, svg);
    const zbtn = (label, text, fn) => h("button", { type: "button", "aria-label": label, title: label, onclick: fn }, text);
    mapCard.append(h("div", { class: "zoom-ctrl" },
      zbtn(t("zoomInBtn"), "+", () => svg.zoomApi.by(2)),
      zbtn(t("zoomOutBtn"), "−", () => svg.zoomApi.by(0.5)),
      zbtn(t("zoomReset"), "⟲", () => svg.zoomApi.reset())));
    mapCard.append(h("p", { class: "map-hint" }, t("zoomHint")));

    const noteText = loc(place.note);
    const note = h("div", { class: "note" },
      h("h2", {}, `✎ ${t("notes")}`),
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

  // ---------- food journal ----------
  let FOOD = null, foodLoading = null, foodCat = "all";
  function loadFood() {
    if (!foodLoading) {
      foodLoading = fetch("data/food.json")
        .then((r) => r.json())
        .then((d) => { FOOD = d; render(); })
        .catch((e) => {
          console.error(e);
          FOOD = { categories: [], entries: [] };
          render();
        });
    }
  }

  const pinSvg = () => {
    const el = document.createElementNS(NS, "svg");
    el.setAttribute("viewBox", "0 0 24 24"); el.setAttribute("aria-hidden", "true"); el.setAttribute("class", "ico");
    el.innerHTML = '<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" fill="currentColor"/>';
    return el;
  };
  const extSvg = () => {
    const el = document.createElementNS(NS, "svg");
    el.setAttribute("viewBox", "0 0 24 24"); el.setAttribute("aria-hidden", "true"); el.setAttribute("class", "ico");
    el.innerHTML = '<path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    return el;
  };

  function foodEntryCard(entry, catMap) {
    const rawPhotos = (entry.photos || []).flatMap(shotsOf).map((p) => ({
      ...p,
      date: p.date || entry.date,
      caption: p.caption || entry.dish || entry.shop
    }));
    const first = rawPhotos[0];
    const n = rawPhotos.length;

    const polaroid = first
      ? h("button", {
          class: "polaroid" + (n > 1 ? " stack" : ""),
          type: "button",
          onclick: () => openLightbox(rawPhotos, 0)
        },
        h("div", { class: "pic" },
          h("img", { src: first.thumb || first.src, alt: loc(entry.dish) || loc(entry.shop), loading: "lazy" }),
          n > 1 ? h("span", { class: "stack-badge", "aria-label": t("photosCount", n) }, `×${n}`) : null),
        h("div", { class: "cap" }, loc(entry.dish) || loc(first.caption) || loc(entry.shop)))
      : h("div", { class: "polaroid" },
        h("div", { class: "pic" }, postcard(entry.id || loc(entry.shop))),
        h("div", { class: "cap" }, loc(entry.dish) || loc(entry.shop)));

    const catInfo = catMap[entry.category];
    const kicker = [catInfo && loc(catInfo.name), loc(entry.style)].filter(Boolean).join(" · ");

    const metaBits = [
      loc(entry.area) ? h("span", { class: "food-area" }, pinSvg(), loc(entry.area)) : null,
      entry.date ? h("span", { class: "food-date" }, /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? fmtDate(entry.date) : entry.date) : null,
      entry.mapsUrl ? h("a", {
        class: "food-maps",
        href: entry.mapsUrl,
        target: "_blank",
        rel: "noopener noreferrer"
      }, t("foodMaps"), extSvg()) : null
    ].filter(Boolean);

    const tasting = loc(entry.tastingNote);
    const placeNote = loc(entry.placeNote);
    const perks = (entry.perks || []).map((p) => loc(p)).filter(Boolean);

    const details = h("div", { class: "food-card note" },
      kicker ? h("div", { class: "kicker" }, kicker) : null,
      h("h2", {}, loc(entry.shop)),
      metaBits.length ? h("div", { class: "food-meta" }, metaBits) : null,
      tasting ? tasting.split(/\n+/).map((para) => h("p", {}, para)) : null,
      placeNote ? placeNote.split(/\n+/).map((para) => h("p", { class: "aside" }, para)) : null,
      perks.length ? h("ul", { class: "plus-list" }, perks.map((txt) => h("li", {}, txt))) : null
    );

    return h("article", { class: "food-entry", id: entry.id ? `food-${entry.id}` : null },
      h("div", { class: "food-photo" }, polaroid),
      details);
  }

  function foodView(routeCat) {
    const hero = h("section", { class: "hero" }, h("h1", {}, t("foodTitle")), h("p", {}, t("foodSubtitle")));
    if (!FOOD) {
      loadFood();
      return [hero, h("p", { class: "muted", style: "text-align:center" }, t("foodLoading"))];
    }

    const cats = FOOD.categories || [];
    const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
    if (routeCat && catMap[routeCat]) foodCat = routeCat;
    if (foodCat !== "all" && !catMap[foodCat]) foodCat = "all";

    const entries = (FOOD.entries || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const totalPhotos = entries.reduce((n, e) => n + (e.photos || []).flatMap(shotsOf).length, 0);

    const filterBtn = (id, label, count) => h("button", {
      type: "button",
      class: "filter-pill",
      "aria-pressed": String(foodCat === id),
      onclick: () => {
        foodCat = id;
        const target = id === "all" ? "#/food" : `#/food/${id}`;
        if (location.hash !== target) history.replaceState(null, "", target);
        render();
      }
    }, label, count != null ? h("span", { class: "pill-count" }, count) : null);

    const filterBar = h("div", { class: "food-filters", role: "group", "aria-label": t("foodTitle") },
      filterBtn("all", t("foodAll"), entries.length),
      ...cats.map((c) => [c, entries.filter((e) => e.category === c.id).length]).filter(([, n]) => n).map(([c, n]) => filterBtn(c.id, loc(c.name), n))
    );

    const shown = foodCat === "all" ? entries : entries.filter((e) => e.category === foodCat);
    const list = shown.length
      ? h("div", { class: "food-list" }, shown.map((e) => foodEntryCard(e, catMap)))
      : h("p", { class: "muted", style: "text-align:center;margin-top:24px" }, t("foodEmpty"));

    return [
      hero,
      h("p", { class: "stats" }, t("foodStats", entries.length, totalPhotos)),
      filterBar,
      list
    ];
  }

  // ---------- events & seasons ----------
  let EVENTS = null, eventsLoading = null, eventsCat = "all";
  function loadEvents() {
    if (!eventsLoading) {
      eventsLoading = fetch("data/events.json")
        .then((r) => r.json())
        .then((d) => { EVENTS = d; render(); })
        .catch((e) => {
          console.error(e);
          EVENTS = { categories: [], entries: [] };
          render();
        });
    }
  }

  function eventEntryCard(entry, catMap) {
    const rawPhotos = (entry.photos || []).flatMap(shotsOf).map((p) => ({
      ...p,
      date: p.date || entry.date,
      caption: p.caption || entry.title
    }));
    const first = rawPhotos[0];
    const n = rawPhotos.length;

    const polaroid = first
      ? h("button", {
          class: "polaroid" + (n > 1 ? " stack" : ""),
          type: "button",
          onclick: () => openLightbox(rawPhotos, 0)
        },
        h("div", { class: "pic" },
          h("img", { src: first.thumb || first.src, alt: loc(entry.title), loading: "lazy" }),
          n > 1 ? h("span", { class: "stack-badge", "aria-label": t("photosCount", n) }, `×${n}`) : null),
        h("div", { class: "cap" }, loc(first.caption) || loc(entry.title)))
      : h("div", { class: "polaroid" },
        h("div", { class: "pic" }, postcard(entry.id || loc(entry.title))),
        h("div", { class: "cap" }, loc(entry.title)));

    const catInfo = catMap[entry.category];
    const kicker = [catInfo && loc(catInfo.name), loc(entry.tag)].filter(Boolean).join(" · ");

    const metaBits = [
      loc(entry.place) ? h("span", { class: "food-area" }, pinSvg(), loc(entry.place)) : null,
      entry.date ? h("span", { class: "food-date" }, /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? fmtDate(entry.date) : entry.date) : null,
      entry.mapsUrl ? h("a", {
        class: "food-maps",
        href: entry.mapsUrl,
        target: "_blank",
        rel: "noopener noreferrer"
      }, t("foodMaps"), extSvg()) : null
    ].filter(Boolean);

    const noteText = loc(entry.note);
    const highlights = (entry.highlights || []).map((x) => loc(x)).filter(Boolean);

    const details = h("div", { class: "food-card event-card note" },
      kicker ? h("div", { class: "kicker" }, kicker) : null,
      h("h2", {}, loc(entry.title)),
      metaBits.length ? h("div", { class: "food-meta" }, metaBits) : null,
      noteText ? noteText.split(/\n+/).map((para) => h("p", {}, para)) : null,
      highlights.length ? h("ul", { class: "plus-list stars" }, highlights.map((txt) => h("li", {}, txt))) : null
    );

    return h("article", { class: "food-entry event-entry", id: entry.id ? `event-${entry.id}` : null },
      h("div", { class: "food-photo" }, polaroid),
      details);
  }

  function eventsView(routeCat) {
    const hero = h("section", { class: "hero" }, h("h1", {}, t("eventsTitle")), h("p", {}, t("eventsSubtitle")));
    if (!EVENTS) {
      loadEvents();
      return [hero, h("p", { class: "muted", style: "text-align:center" }, t("eventsLoading"))];
    }

    const cats = EVENTS.categories || [];
    const catMap = Object.fromEntries(cats.map((c) => [c.id, c]));
    if (routeCat && catMap[routeCat]) eventsCat = routeCat;
    if (eventsCat !== "all" && !catMap[eventsCat]) eventsCat = "all";

    const entries = (EVENTS.entries || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const totalPhotos = entries.reduce((n, e) => n + (e.photos || []).flatMap(shotsOf).length, 0);

    const filterBtn = (id, label, count) => h("button", {
      type: "button",
      class: "filter-pill",
      "aria-pressed": String(eventsCat === id),
      onclick: () => {
        eventsCat = id;
        const target = id === "all" ? "#/events" : `#/events/${id}`;
        if (location.hash !== target) history.replaceState(null, "", target);
        render();
      }
    }, label, count != null ? h("span", { class: "pill-count" }, count) : null);

    const filterBar = h("div", { class: "food-filters", role: "group", "aria-label": t("eventsTitle") },
      filterBtn("all", t("eventsAll"), entries.length),
      ...cats.map((c) => [c, entries.filter((e) => e.category === c.id).length]).filter(([, n]) => n).map(([c, n]) => filterBtn(c.id, loc(c.name), n))
    );

    const shown = eventsCat === "all" ? entries : entries.filter((e) => e.category === eventsCat);
    const groups = [];
    if (shown.length) {
      const byYear = new Map();
      for (const e of shown) {
        const y = (e.date || "").slice(0, 4) || "—";
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(e);
      }
      for (const [year, list] of byYear) {
        groups.push(h("section", { class: "event-year" },
          h("h2", { class: "year-heading" }, h("span", {}, year)),
          h("div", { class: "food-list" }, list.map((e) => eventEntryCard(e, catMap)))));
      }
    } else {
      groups.push(h("p", { class: "muted", style: "text-align:center;margin-top:24px" }, t("eventsEmpty")));
    }

    return [
      hero,
      h("p", { class: "stats" }, t("eventsStats", entries.length, totalPhotos)),
      filterBar,
      ...groups
    ];
  }

  // ---------- music ----------
  let MUSIC = null, musicLoading = null, musicMood = "all";
  function loadMusic() {
    if (!musicLoading) {
      musicLoading = fetch("data/music.json")
        .then((r) => r.json())
        .then((d) => { MUSIC = d; render(); })
        .catch((e) => {
          console.error(e);
          MUSIC = { moods: [], onRepeat: [], playlists: [] };
          render();
        });
    }
  }

  const vinylSvg = () => {
    const el = document.createElementNS(NS, "svg");
    el.setAttribute("viewBox", "0 0 64 64"); el.setAttribute("aria-hidden", "true"); el.setAttribute("class", "vinyl");
    el.innerHTML =
      '<circle cx="32" cy="32" r="30" fill="#2a221d"/>' +
      '<circle cx="32" cy="32" r="24" fill="none" stroke="#463932" stroke-width="1"/>' +
      '<circle cx="32" cy="32" r="19" fill="none" stroke="#463932" stroke-width="1"/>' +
      '<circle cx="32" cy="32" r="11" fill="var(--accent)"/>' +
      '<circle cx="32" cy="32" r="3" fill="var(--card)"/>';
    return el;
  };

  function listenLinks(item) {
    const links = [
      item.spotifyUrl ? h("a", { class: "music-link", href: item.spotifyUrl, target: "_blank", rel: "noopener noreferrer" }, "Spotify", extSvg()) : null,
      item.youtubeUrl ? h("a", { class: "music-link", href: item.youtubeUrl, target: "_blank", rel: "noopener noreferrer" }, "YouTube", extSvg()) : null,
      item.appleUrl ? h("a", { class: "music-link", href: item.appleUrl, target: "_blank", rel: "noopener noreferrer" }, "Apple Music", extSvg()) : null
    ].filter(Boolean);
    return links;
  }

  function trackCard(tr) {
    const links = listenLinks(tr);
    return h("article", { class: "track-card note" },
      h("div", { class: "track-top" },
        vinylSvg(),
        h("div", { class: "track-info" },
          h("h3", {}, tr.title),
          h("div", { class: "track-artist" }, tr.artist),
          (tr.plays || loc(tr.tag)) ? h("div", { class: "kicker" }, tr.plays ? t("musicPlays", tr.plays) : loc(tr.tag)) : null)),
      loc(tr.note) ? h("p", { class: "track-note" }, loc(tr.note)) : null,
      links.length ? h("div", { class: "music-actions" }, links) : null);
  }

  function cassetteCard(pl, moodMap) {
    const moodInfo = moodMap[pl.mood];
    const links = listenLinks(pl);
    const tracks = pl.tracks || [];
    const embedBox = h("div", { class: "embed-box", hidden: true });
    let embedBtn = null;
    if (pl.embedUrl) {
      embedBtn = h("button", {
        type: "button",
        class: "music-link preview-btn",
        onclick: () => {
          const open = embedBox.hidden;
          embedBox.hidden = !open;
          embedBtn.textContent = open ? t("musicPreviewHide") : t("musicPreviewShow");
          if (open && !embedBox.firstChild) {
            embedBox.append(h("iframe", {
              src: pl.embedUrl,
              loading: "lazy",
              allow: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
              title: loc(pl.title)
            }));
          }
        }
      }, t("musicPreviewShow"));
    }

    return h("article", { class: `cassette-card tape-${pl.color || "terracotta"}` },
      h("div", { class: "cassette-stripe" },
        h("span", { class: "tape-reels", "aria-hidden": "true" }, h("i"), h("i")),
        moodInfo ? h("span", { class: "tape-mood" }, loc(moodInfo.name)) : null),
      h("div", { class: "cassette-body" },
        h("h3", {}, loc(pl.title)),
        loc(pl.note) ? h("p", { class: "cassette-note" }, loc(pl.note)) : null,
        tracks.length ? h("ol", { class: "tape-tracks" },
          tracks.map((tr) => h("li", {},
            h("strong", {}, tr.title),
            tr.artist ? h("span", {}, ` — ${tr.artist}`) : null))) : null,
        (links.length || embedBtn) ? h("div", { class: "music-actions" }, ...links, embedBtn) : null,
        pl.embedUrl ? embedBox : null));
  }

  function musicView(routeMood) {
    const hero = h("section", { class: "hero" }, h("h1", {}, t("musicTitle")), h("p", {}, t("musicSubtitle")));
    if (!MUSIC) {
      loadMusic();
      return [hero, h("p", { class: "muted", style: "text-align:center" }, t("musicLoading"))];
    }

    const moods = MUSIC.moods || [];
    const moodMap = Object.fromEntries(moods.map((m) => [m.id, m]));
    if (routeMood && moodMap[routeMood]) musicMood = routeMood;
    if (musicMood !== "all" && !moodMap[musicMood]) musicMood = "all";

    const repeat = MUSIC.onRepeat || [];
    const playlists = MUSIC.playlists || [];

    const filterBtn = (id, label, count) => h("button", {
      type: "button",
      class: "filter-pill",
      "aria-pressed": String(musicMood === id),
      onclick: () => {
        musicMood = id;
        const target = id === "all" ? "#/music" : `#/music/${id}`;
        if (location.hash !== target) history.replaceState(null, "", target);
        render();
      }
    }, label, count != null ? h("span", { class: "pill-count" }, count) : null);

    const filterBar = h("div", { class: "food-filters", role: "group", "aria-label": t("musicPlaylistsTitle") },
      filterBtn("all", t("musicAll"), playlists.length),
      ...moods.map((m) => [m, playlists.filter((p) => p.mood === m.id).length]).filter(([, n]) => n).map(([m, n]) => filterBtn(m.id, loc(m.name), n))
    );

    const shown = musicMood === "all" ? playlists : playlists.filter((p) => p.mood === musicMood);

    // Plain numbered lists: title and artist, nothing else.
    const songList = (tracks) => h("ol", { class: "rank-list" }, tracks.map((tr) =>
      h("li", {}, h("div", {},
        h("span", { class: "rank-title" }, tr.title),
        tr.artist ? h("span", { class: "rank-artist" }, tr.artist) : null))));
    const mix = (pl) => {
      const links = listenLinks(pl);
      return h("section", { class: "mix" },
        h("h3", {}, loc(pl.title)),
        loc(pl.note) ? h("p", { class: "mix-note" }, loc(pl.note)) : null,
        songList(pl.tracks || []),
        links.length ? h("div", { class: "music-actions" }, links) : null);
    };

    return [
      hero,
      repeat.length ? h("h2", { class: "section-title" }, t("musicRepeatTitle")) : null,
      repeat.length ? songList(repeat) : null,
      playlists.length ? h("h2", { class: "section-title" }, t("musicPlaylistsTitle")) : null,
      playlists.length > 4 ? filterBar : null,
      shown.length
        ? shown.map(mix)
        : (playlists.length ? h("p", { class: "muted", style: "text-align:center;margin-top:24px" }, t("musicEmpty")) : null)
    ].flat().filter(Boolean);
  }

  // ---------- about me ----------
  let ABOUT = null, aboutLoading = null;
  function loadAbout() {
    if (!aboutLoading) {
      aboutLoading = fetch("data/about.json")
        .then((r) => r.json())
        .then((d) => { ABOUT = d; render(); })
        .catch((e) => {
          console.error(e);
          ABOUT = {};
          render();
        });
    }
  }

  function aboutView() {
    const hero = h("section", { class: "hero" }, h("h1", {}, t("aboutTitle")), h("p", {}, t("aboutSubtitle")));
    if (!ABOUT) {
      loadAbout();
      return [hero, h("p", { class: "muted", style: "text-align:center" }, t("aboutLoading"))];
    }

    const pic = h("div", { class: "pic" });
    if (ABOUT.photo) pic.append(h("img", { src: ABOUT.photo, alt: ABOUT.name || t("title") }));
    else pic.append(chapterArt("about"));
    const polaroid = h("div", { class: "polaroid about-polaroid" },
      pic,
      h("div", { class: "cap" }, loc(ABOUT.photoCaption) || ABOUT.name || t("title")));

    const facts = ABOUT.facts || [];
    const factsCard = facts.length ? h("div", { class: "note about-facts" },
      h("h2", {}, t("aboutFactsTitle")),
      h("dl", {}, facts.flatMap((f) => [h("dt", {}, loc(f.label)), h("dd", {}, loc(f.value))]))) : null;

    const bioText = loc(ABOUT.bio);
    const interests = (ABOUT.interests || []).map((x) => loc(x)).filter(Boolean);
    const bioCard = h("div", { class: "note about-bio" },
      loc(ABOUT.headline) ? h("h2", {}, loc(ABOUT.headline)) : null,
      ...(bioText ? bioText.split(/\n+/).map((para) => h("p", {}, para)) : []),
      interests.length ? h("div", { class: "about-interests" },
        h("h3", {}, t("aboutInterestsTitle")),
        h("ul", {}, interests.map((x) => h("li", {}, x)))) : null);

    const colophon = loc(ABOUT.colophon) ? h("div", { class: "note about-colophon" },
      h("h2", {}, t("aboutColophonTitle")),
      h("p", {}, loc(ABOUT.colophon))) : null;

    const links = (ABOUT.links || []).filter((l) => l && l.url);
    const linksCard = links.length ? h("div", { class: "note about-links" },
      h("h2", {}, t("aboutLinksTitle")),
      h("div", { class: "music-actions" },
        links.map((l) => h("a", { class: "music-link", href: l.url, target: "_blank", rel: "noopener noreferrer" }, loc(l.label) || l.label, extSvg())))) : null;

    return [
      hero,
      h("div", { class: "about-layout" },
        h("div", { class: "about-side" }, polaroid, factsCard),
        h("div", { class: "about-main" }, bioCard, colophon, linksCard))
    ];
  }

  // ---------- routing ----------
  // #/                       home (diary cover & chapters)
  // #/trips                  all countries
  // #/trips/japan            a country
  // #/trips/japan/tokyo      a region of that country
  // #/food                   food journal (optional #/food/<category>)
  // #/events                 events & seasons (optional #/events/<category>)
  // #/music                  music & playlists (optional #/music/<mood>)
  // #/about                  about me
  function go(c, slug) { location.hash = `#/trips/${c.slug}/${slug}`; }
  function route() {
    const tm = location.hash.match(/^#\/trips(?:\/([a-z]+)(?:\/([a-z-]+))?)?\/?$/);
    if (tm) {
      if (tm[1] && C[tm[1]]) {
        return tm[2] ? { view: "region", c: C[tm[1]], slug: tm[2] } : { view: "country", c: C[tm[1]] };
      }
      return { view: "trips" };
    }
    const fm = location.hash.match(/^#\/food(?:\/([a-z0-9-]+))?/);
    if (fm) return { view: "food", cat: fm[1] || null };
    const em = location.hash.match(/^#\/events(?:\/([a-z0-9-]+))?/);
    if (em) return { view: "events", cat: em[1] || null };
    const mm = location.hash.match(/^#\/music(?:\/([a-z0-9-]+))?/);
    if (mm) return { view: "music", mood: mm[1] || null };
    if (/^#\/about\/?$/.test(location.hash)) return { view: "about" };
    // Quietly upgrade any legacy #/japan or #/japan/tokyo link to #/trips/...
    const legacy = location.hash.match(/^#\/([a-z]+)(?:\/([a-z-]+))?/);
    if (legacy && C[legacy[1]]) {
      const upgraded = `#/trips/${legacy[1]}${legacy[2] ? `/${legacy[2]}` : ""}`;
      history.replaceState(null, "", upgraded);
      return legacy[2] ? { view: "region", c: C[legacy[1]], slug: legacy[2] } : { view: "country", c: C[legacy[1]] };
    }
    return { view: "home" };
  }
  function sectionOf(r) {
    if (r.view === "food") return "food";
    if (r.view === "events") return "events";
    if (r.view === "music") return "music";
    if (r.view === "about") return "about";
    if (r.view === "trips" || r.view === "country" || r.view === "region") return "trips";
    return "home";
  }
  let lastRoute = "";
  const zoomState = {}; // "country/region" -> "all" | "zoom" (for regions with a zoomed view)
  function render() {
    applyStatic();
    closeMenu();
    const r = route();
    const sec = sectionOf(r);
    document.body.dataset.section = sec;
    const creditEl = document.querySelector(".footer .credit");
    if (creditEl) {
      const creditText = (r.view === "country" || r.view === "region") && r.c ? loc(r.c.credit) : "";
      creditEl.hidden = !creditText;
      creditEl.textContent = creditText;
    }
    document.querySelectorAll("[data-nav]").forEach((a) => {
      if (a.dataset.nav === sec) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
      if (a.dataset.nav === "music") a.hidden = !musicReady() && sec !== "music";
    });
    const standalone = r.view === "food" || r.view === "events" || r.view === "music" || r.view === "about";
    if (!loaded && !standalone) return;
    const view = r.view === "food" ? foodView(r.cat)
      : r.view === "events" ? eventsView(r.cat)
      : r.view === "music" ? musicView(r.mood)
      : r.view === "about" ? aboutView()
      : r.view === "trips" ? tripsView()
      : r.view === "region" ? regionView(r.c, r.slug)
      : r.view === "country" ? countryView(r.c)
      : homeView();
    app.replaceChildren(...view);
    const key = standalone ? `#/${r.view}` : location.hash;
    if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
    const info = r.view === "region" ? r.c.R[r.slug] : null;
    document.title = r.view === "food" ? `${t("foodTitle")} · ${t("title")}`
      : r.view === "events" ? `${t("eventsTitle")} · ${t("title")}`
      : r.view === "music" ? `${t("musicTitle")} · ${t("title")}`
      : r.view === "about" ? `${t("aboutTitle")} · ${t("title")}`
      : r.view === "trips" ? `${t("tripsTitle")} · ${t("title")}`
      : info ? `${regionName(info)} · ${t("title")}`
      : r.view === "country" ? `${countryName(r.c)} · ${t("title")}` : t("title");
  }
  window.addEventListener("hashchange", render);

  // ---------- load ----------
  // Every country's album file is small, so they all load up front (the home page
  // needs their counts and covers). The maps load only when a country is opened.
  let loaded = false;
  applyStatic();
  loadMusic();
  Promise.all(Object.values(C).map((c) => fetch(c.dataFile).then((r) => r.json()).then((d) => setData(c, d))))
    .then(() => { loaded = true; render(); })
    .catch((err) => {
      app.replaceChildren(h("p", { class: "muted" }, "Could not load the diary."));
      console.error(err);
    });
})();
