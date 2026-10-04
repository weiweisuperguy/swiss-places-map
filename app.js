(function () {
  "use strict";

  var BRUGG = [47.4808, 8.2089];
  var DAY = 86400000;
  var EMBEDDED = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  var COARSE = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  // Scales that read best in their natural order rather than alphabetically.
  var ORDER = {
    effort: ["🟢 T1 Easy · やさしい", "🟡 T2 Mountain trail · 一般登山道", "🟠 T3 Sure-footed · 健脚向け"],
    crowds: ["💎 Hidden gem · 穴場", "🙂 Some visitors · ほどほど", "👥 Popular · 人気", "🔥 Very popular · 大人気"]
  };

  var TEXT = {
    ja: {
      title: "スイスおすすめ地図",
      count: function (n, t) { return n === t ? t + "か所" : n + " / " + t + "か所"; },
      search: "名前・キーワードで検索",
      all: { type: "種類：すべて", region: "地域：すべて", highlight: "見どころ：すべて", effort: "難易度：すべて", crowds: "混雑度：すべて" },
      reset: "リセット",
      empty: "条件に合うスポットがありません",
      fromBrugg: "ブルックから",
      open: "📖 ページを開く",
      gmaps: "🧭 Googleマップ",
      route: "🔗 公式・ルート情報",
      home: "ブルック（Brugg AG）駅",
      satellite: "🛰️ 航空写真",
      topo: "🗺️ 地図",
      trails: "🥾 登山道",
      noClosure: "✅ 季節運休なし",
      closed: "⛔ 今季の営業・運行は終了",
      lastDay: "⚠️ 本日で今季終了",
      closedUntil: function (d) { return "🚧 運休中（" + d + "再開）"; },
      soon: function (d) { return "⚠️ まもなく終了（" + d + "まで）"; },
      until: function (d) { return "✅ " + d + "まで営業・運行"; },
      fmt: function (dt) { return (dt.getMonth() + 1) + "/" + dt.getDate(); },
      dur: function (m) { var h = Math.floor(m / 60), r = m % 60; return h ? h + "時間" + (r ? r + "分" : "") : r + "分"; },
      walk: function (h) { return "歩行 約" + TEXT.ja.dur(Math.round(h * 6) * 10); },
      twoFinger: "2本指で地図を動かせます",
      wheel: "地図をクリックするとスクロールでズームできます",
      loadErr: "データを読み込めませんでした",
      libErr: "地図ライブラリを読み込めませんでした"
    },
    en: {
      title: "Swiss picks map",
      count: function (n, t) { return n === t ? t + " places" : n + " / " + t + " places"; },
      search: "Search by name or keyword",
      all: { type: "Type: all", region: "Region: all", highlight: "Highlights: all", effort: "Effort: all", crowds: "Crowds: all" },
      reset: "Reset",
      empty: "No places match these filters",
      fromBrugg: "from Brugg",
      open: "📖 Open page",
      gmaps: "🧭 Google Maps",
      route: "🔗 Info / route",
      home: "Brugg AG station",
      satellite: "🛰️ Satellite",
      topo: "🗺️ Map",
      trails: "🥾 Hiking trails",
      noClosure: "✅ No seasonal closure",
      closed: "⛔ Closed for the season",
      lastDay: "⚠️ Last day today",
      closedUntil: function (d) { return "🚧 Closed · reopens " + d; },
      soon: function (d) { return "⚠️ Last days · until " + d; },
      until: function (d) { return "✅ Open until " + d; },
      fmt: function (dt) { return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); },
      dur: function (m) { var h = Math.floor(m / 60), r = m % 60; return h ? h + " h" + (r ? " " + r + " min" : "") : r + " min"; },
      walk: function (h) { return "~" + TEXT.en.dur(Math.round(h * 6) * 10) + " walking"; },
      twoFinger: "Use two fingers to move the map",
      wheel: "Click the map to zoom with the scroll wheel",
      loadErr: "Could not load the data",
      libErr: "The map library failed to load"
    }
  };

  var TYPE_COLORS = {
    "Hike": "#2e7d32", "Walk": "#e0a100", "Summit": "#6d4c41", "Lake": "#1565c0",
    "Gorge": "#6a1b9a", "Waterfall": "#00838f", "Town": "#ad1457", "Scenic train": "#c62828"
  };

  var params = new URLSearchParams(location.search);
  var reqLang = (params.get("lang") || "").toLowerCase().slice(0, 2);
  var state = {
    lang: Object.prototype.hasOwnProperty.call(TEXT, reqLang) ? reqLang
      : ((navigator.language || "").toLowerCase().indexOf("ja") === 0 ? "ja" : "en"),
    q: "", type: "", region: "", highlight: "", effort: "", crowds: "",
    selected: null
  };

  var places = [];
  var markers = {};
  var map, layers, pendingOpen = null, hintTimer = null;

  function $(id) { return document.getElementById(id); }
  function t() { return TEXT[state.lang]; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function lab(l) { return l ? (l.emoji ? l.emoji + " " : "") + l[state.lang] : ""; }
  function name(p) { return state.lang === "ja" ? p.name_ja : p.name_en; }
  function altName(p) { return state.lang === "ja" ? p.name_en : p.name_ja; }
  function summary(p) { return state.lang === "ja" ? p.summary_ja : p.summary_en; }
  function byId(id) {
    for (var i = 0; i < places.length; i++) if (places[i].id === id) return places[i];
    return null;
  }

  // Search text: NFKC, lower case, hiragana folded to katakana so "りす" finds "リス".
  function norm(s) {
    s = String(s || "");
    if (s.normalize) s = s.normalize("NFKC");
    return s.toLowerCase().replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }

  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  // "Today" in Switzerland, so a viewer abroad sees the same status as the Notion formulas.
  function swissToday() {
    try {
      var z = {};
      new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Zurich", year: "numeric", month: "numeric", day: "numeric" })
        .formatToParts(new Date()).forEach(function (x) { z[x.type] = +x.value; });
      if (z.year) return new Date(z.year, z.month - 1, z.day);
    } catch (e) { /* fall through */ }
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function status(p) {
    var today = swissToday();
    var reopens = parseDay(p.reopens);
    if (reopens && Math.round((reopens - today) / DAY) > 0) return { cls: "closed", text: t().closedUntil(t().fmt(reopens)) };
    var end = parseDay(p.open_until);
    if (!end) return { cls: "open", text: t().noClosure };
    var days = Math.round((end - today) / DAY);
    var d = t().fmt(end);
    if (days < 0) return { cls: "closed", text: t().closed };
    if (days === 0) return { cls: "soon", text: t().lastDay };
    if (days <= 7) return { cls: "soon", text: t().soon(d) };
    return { cls: "open", text: t().until(d) };
  }

  function matches(p) {
    if (state.type && (!p.type || p.type.key !== state.type)) return false;
    if (state.region && (!p.region || p.region.key !== state.region)) return false;
    if (state.effort && (!p.effort || p.effort.key !== state.effort)) return false;
    if (state.crowds && (!p.crowds || p.crowds.key !== state.crowds)) return false;
    if (state.highlight && !p.highlights.some(function (h) { return h.key === state.highlight; })) return false;
    if (state.q && p._hay.indexOf(norm(state.q)) < 0) return false;
    return true;
  }

  function warnings(p, strongOnly) {
    return (p.headsup || []).filter(function (h) { return !strongOnly || /^(⛓|❄)/.test(h.key); });
  }

  function pinIcon(p, selected) {
    var c = TYPE_COLORS[p.type && p.type.en] || "#333";
    return L.divIcon({
      className: "",
      html: '<div class="pin' + (selected ? " sel" : "") + '" style="--c:' + c + '">' + esc(p.type ? p.type.emoji : "📍") + "</div>",
      iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14]
    });
  }

  function popupHtml(p) {
    var st = status(p);
    var compact = map && map.getSize().y < 380;
    var links = '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + t().open + "</a>" +
      '<a href="https://www.google.com/maps/search/?api=1&query=' + p.lat + "," + p.lon + '" target="_blank" rel="noopener">' + t().gmaps + "</a>";
    if (p.route) links += '<a href="' + esc(p.route) + '" target="_blank" rel="noopener">' + t().route + "</a>";
    var html = '<div class="pop"><h3>' + esc(name(p)) + '</h3><div class="alt">' + esc(altName(p)) + "</div>" +
      '<div class="status ' + st.cls + '">' + esc(st.text) + '</div><div class="links">' + links + "</div>";
    if (!compact) {
      var chips = [lab(p.type), lab(p.effort), lab(p.crowds)];
      if (p.from_brugg) chips.push("🚆 " + t().fromBrugg + " " + t().dur(p.from_brugg));
      if (p.walking) chips.push(t().walk(p.walking));
      html += '<div class="chips">' +
        chips.filter(Boolean).map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("") +
        warnings(p).map(function (w) { return '<span class="chip warn">' + esc(lab(w)) + "</span>"; }).join("") +
        "</div><p>" + esc(summary(p)) + "</p>";
    }
    return html + "</div>";
  }

  // Keep popups inside the visible map, which can be quite small in a Notion embed.
  function fitPopups() {
    if (!map) return;
    var s = map.getSize();
    places.forEach(function (p) {
      var m = markers[p.id];
      var popup = m && m.getPopup();
      if (!popup) return;
      popup.options.maxHeight = Math.max(110, s.y - 140);
      popup.options.maxWidth = Math.max(170, Math.min(290, s.x - 50));
      popup.options.minWidth = Math.min(210, popup.options.maxWidth);
    });
    var open = state.selected && markers[state.selected];
    if (open && open.isPopupOpen()) open.getPopup().update();
  }

  // Scroll only the list, never the Notion page around the embed.
  function scrollCardIntoList(card) {
    var list = $("list");
    var lr = list.getBoundingClientRect(), cr = card.getBoundingClientRect();
    if (cr.top >= lr.top && cr.bottom <= lr.bottom) return;
    var top = list.scrollTop + (cr.top - lr.top) - (lr.height - cr.height) / 2;
    if (list.scrollTo) list.scrollTo({ top: top, behavior: "smooth" });
    else list.scrollTop = top;
  }

  function renderList(visible) {
    var list = $("list");
    if (!visible.length) {
      list.innerHTML = '<li class="empty">' + esc(t().empty) + "</li>";
      return;
    }
    list.innerHTML = visible.map(function (p) {
      var st = status(p);
      var meta = [];
      if (p.from_brugg) meta.push("🚆 " + t().dur(p.from_brugg));
      if (p.effort) meta.push(lab(p.effort));
      if (p.crowds) meta.push(lab(p.crowds));
      warnings(p, true).forEach(function (w) { meta.push(lab(w)); });
      return '<li class="card" tabindex="0" data-id="' + p.id + '"' + (state.selected === p.id ? ' aria-current="true"' : "") + ">" +
        '<div class="row1"><span class="emoji">' + esc(p.type ? p.type.emoji : "📍") + "</span>" +
        '<div><div class="name">' + esc(name(p)) + '</div><div class="alt">' + esc(altName(p)) + "</div></div></div>" +
        '<div class="meta"><span class="status ' + st.cls + '">' + esc(st.text) + "</span>" +
        meta.map(function (m) { return "<span>" + esc(m) + "</span>"; }).join("") + "</div>" +
        '<p class="sum">' + esc(summary(p)) + "</p></li>";
    }).join("");
  }

  function fillSelect(id, key, getter, multi) {
    var sel = $(id);
    var seen = {}, opts = [];
    places.forEach(function (p) {
      var vals = multi ? getter(p) : [getter(p)];
      vals.forEach(function (v) { if (v && !seen[v.key]) { seen[v.key] = 1; opts.push(v); } });
    });
    var order = ORDER[key];
    opts.sort(order
      ? function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); }
      : function (a, b) { return a[state.lang].localeCompare(b[state.lang], state.lang); });
    sel.innerHTML = '<option value="">' + esc(t().all[key]) + "</option>" + opts.map(function (o) {
      return '<option value="' + esc(o.key) + '"' + (state[key] === o.key ? " selected" : "") + ">" + esc(lab(o)) + "</option>";
    }).join("");
    sel.classList.toggle("active", !!state[key]);
  }

  function renderChrome() {
    document.documentElement.lang = state.lang;
    $("title").textContent = t().title;
    $("q").placeholder = t().search;
    $("reset").textContent = t().reset;
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang));
    });
    fillSelect("f-type", "type", function (p) { return p.type; });
    fillSelect("f-region", "region", function (p) { return p.region; });
    fillSelect("f-highlight", "highlight", function (p) { return p.highlights; }, true);
    fillSelect("f-effort", "effort", function (p) { return p.effort; });
    fillSelect("f-crowds", "crowds", function (p) { return p.crowds; });
  }

  function render() {
    var visible = places.filter(matches);
    $("count").textContent = t().count(visible.length, places.length);
    renderList(visible);
    places.forEach(function (p) {
      var m = markers[p.id];
      var show = visible.indexOf(p) >= 0;
      if (show && !map.hasLayer(m)) m.addTo(map);
      if (!show && map.hasLayer(m)) m.remove();
    });
  }

  function select(id, opts) {
    opts = opts || {};
    if (pendingOpen) { map.off("moveend", pendingOpen); pendingOpen = null; }
    var prev = state.selected;
    state.selected = id;
    if (prev && prev !== id && markers[prev]) {
      markers[prev].setIcon(pinIcon(byId(prev), false));
      markers[prev].setZIndexOffset(0);
    }
    var p = byId(id);
    if (!p) return;
    var m = markers[id];
    m.setIcon(pinIcon(p, true));
    m.setZIndexOffset(1000);
    document.querySelectorAll(".card").forEach(function (c) {
      if (c.dataset.id === id) {
        c.setAttribute("aria-current", "true");
        if (opts.scroll !== false) scrollCardIntoList(c);
      } else {
        c.removeAttribute("aria-current");
      }
    });
    if (opts.fly !== false) {
      if (!map.hasLayer(m)) m.addTo(map);
      var target = L.latLng(p.lat, p.lon);
      if (map.getZoom() >= 12.5 && map.getCenter().distanceTo(target) < 50) {
        m.openPopup();
      } else {
        map.flyTo(target, Math.max(map.getZoom(), 13), { duration: 1.1 });
        pendingOpen = function () {
          pendingOpen = null;
          if (state.selected === id && map.hasLayer(m)) m.openPopup();
        };
        map.once("moveend", pendingOpen);
      }
    }
    if (history.replaceState) history.replaceState(null, "", location.pathname + location.search + "#" + id);
  }

  function setLang(lang) {
    state.lang = lang;
    var u = new URL(location.href);
    u.searchParams.set("lang", lang);
    if (history.replaceState) history.replaceState(null, "", u.pathname + u.search + u.hash);
    renderChrome();
    render();
    layers.control.remove();
    addLayerControl();
    places.forEach(function (p) {
      var m = markers[p.id];
      m.options.title = name(p);
      var el = m.getElement();
      if (el) el.title = name(p);
    });
    var open = state.selected && markers[state.selected];
    if (open && open.isPopupOpen()) open.getPopup().update();
  }

  function addLayerControl() {
    var base = {}, over = {};
    base[t().satellite] = layers.sat;
    base[t().topo] = layers.topo;
    over[t().trails] = layers.trails;
    layers.control = L.control.layers(base, over, { position: "topright" }).addTo(map);
  }

  function showHint(text) {
    var hint = $("hint");
    hint.textContent = text;
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.hidden = true; }, 1600);
  }

  // Inside Notion the map must not swallow page scrolling: wheel zoom only after a click,
  // and on touch screens one finger scrolls the page while two fingers move the map.
  function setupEmbeddedGestures() {
    if (!EMBEDDED) return;
    var el = map.getContainer();
    if (COARSE) {
      el.addEventListener("touchstart", function (e) {
        if (e.touches.length === 1) showHint(t().twoFinger);
      }, { passive: true });
    } else {
      el.addEventListener("wheel", function () { if (!map.scrollWheelZoom.enabled()) showHint(t().wheel); }, { passive: true });
      map.on("click", function () { map.scrollWheelZoom.enable(); });
      el.addEventListener("mouseleave", function () { map.scrollWheelZoom.disable(); });
    }
  }

  function initMap() {
    var attr = '&copy; <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">swisstopo</a>';
    var wmts = "https://wmts.geo.admin.ch/1.0.0/";
    layers = {
      sat: L.tileLayer(wmts + "ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg", { maxZoom: 19, attribution: attr }),
      topo: L.tileLayer(wmts + "ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg", { maxNativeZoom: 18, maxZoom: 19, attribution: attr }),
      trails: L.tileLayer(wmts + "ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png", { maxNativeZoom: 18, maxZoom: 19, opacity: 0.85, attribution: attr })
    };
    map = L.map("map", {
      layers: [layers.sat],
      zoomSnap: 0.25,
      scrollWheelZoom: !EMBEDDED,
      dragging: !(EMBEDDED && COARSE)
    });
    addLayerControl();
    L.control.scale({ imperial: false }).addTo(map);
    L.marker(BRUGG, {
      icon: L.divIcon({ className: "", html: '<div class="pin home">🏠</div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
      keyboard: false
    }).addTo(map).bindTooltip(function () { return t().home; });

    places.forEach(function (p) {
      var m = L.marker([p.lat, p.lon], { icon: pinIcon(p, false), title: name(p), riseOnHover: true });
      m.bindPopup(function () { return popupHtml(p); }, {
        autoPanPaddingTopLeft: [10, 56],
        autoPanPaddingBottomRight: [10, 10]
      });
      // Pin opened by tap or keyboard: cancel any flight to another place and select this one.
      m.on("popupopen", function () {
        if (state.selected === p.id) return;
        if (pendingOpen) { map.off("moveend", pendingOpen); pendingOpen = null; }
        map.stop();
        select(p.id, { fly: false });
        m.getPopup().update();
      });
      markers[p.id] = m;
    });

    map.on("zoomend", function () { map.getContainer().classList.toggle("far", map.getZoom() < 8.5); });
    map.on("resize", fitPopups);
    map.fitBounds(L.latLngBounds(places.map(function (p) { return [p.lat, p.lon]; })).extend(BRUGG), { padding: [12, 12] });
    fitPopups();
    if (window.ResizeObserver) {
      new ResizeObserver(function () { map.invalidateSize({ debounceMoveend: true }); }).observe(map.getContainer());
    }
    setupEmbeddedGestures();
  }

  function bindUi() {
    var list = $("list");
    list.addEventListener("click", function (e) {
      var card = e.target.closest(".card");
      if (card) select(card.dataset.id, { scroll: false });
    });
    list.addEventListener("keydown", function (e) {
      var card = e.target.closest(".card");
      if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(card.dataset.id, { scroll: false }); }
    });
    var q = $("q");
    q.addEventListener("input", function (e) {
      state.q = q.value.trim();
      // While a Japanese IME is composing, don't flash "no results" for half-typed words.
      if (e.isComposing && !places.some(matches)) return;
      render();
    });
    q.addEventListener("compositionend", function () { state.q = q.value.trim(); render(); });
    [["f-type", "type"], ["f-region", "region"], ["f-highlight", "highlight"], ["f-effort", "effort"], ["f-crowds", "crowds"]].forEach(function (pair) {
      $(pair[0]).addEventListener("change", function (e) {
        state[pair[1]] = e.target.value;
        e.target.classList.toggle("active", !!e.target.value);
        render();
      });
    });
    $("reset").addEventListener("click", function () {
      state.q = state.type = state.region = state.highlight = state.effort = state.crowds = "";
      q.value = "";
      renderChrome();
      render();
    });
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.addEventListener("click", function () { if (b.dataset.lang !== state.lang) setLang(b.dataset.lang); });
    });
  }

  function showError(msg) {
    $("list").innerHTML = '<li class="empty">' + esc(msg) + "</li>";
  }

  fetch("places.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      places = data.places;
      places.forEach(function (p) {
        var labels = [p.type, p.region, p.effort, p.crowds].concat(p.highlights, p.headsup).filter(Boolean)
          .map(function (l) { return l.en + " " + l.ja; });
        p._hay = norm([p.name_en, p.name_ja, p.summary_en, p.summary_ja].concat(labels).join(" "));
      });
      renderChrome();
      if (typeof L === "undefined") { showError(t().libErr); return; }
      initMap();
      bindUi();
      render();
      var hash = location.hash.slice(1);
      if (hash && byId(hash)) select(hash);
    })
    .catch(function () {
      renderChrome();
      showError(t().loadErr);
    });
})();
