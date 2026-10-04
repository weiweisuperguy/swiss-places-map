(function () {
  "use strict";

  var BRUGG = [47.4808, 8.2089];
  var DAY = 86400000;

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
      route: "🥾 ルート",
      home: "ブルック（Brugg AG）駅",
      satellite: "🛰️ 航空写真",
      topo: "🗺️ 地図",
      trails: "🥾 登山道",
      noClosure: "✅ 季節運休なし",
      closed: "⛔ 今季の運行は終了",
      soon: function (d) { return "⚠️ まもなく終了（" + d + "まで）"; },
      until: function (d) { return "✅ " + d + "まで運行"; },
      fmt: function (dt) { return (dt.getMonth() + 1) + "/" + dt.getDate(); },
      dur: function (m) { var h = Math.floor(m / 60), r = m % 60; return h ? h + "時間" + (r ? r + "分" : "") : r + "分"; },
      walk: function (h) { return "歩行 約" + h + "時間"; }
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
      route: "🥾 Route",
      home: "Brugg AG station",
      satellite: "🛰️ Satellite",
      topo: "🗺️ Map",
      trails: "🥾 Hiking trails",
      noClosure: "✅ No seasonal closure",
      closed: "⛔ Closed for the season",
      soon: function (d) { return "⚠️ Last days · until " + d; },
      until: function (d) { return "✅ Open until " + d; },
      fmt: function (dt) { return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); },
      dur: function (m) { var h = Math.floor(m / 60), r = m % 60; return h ? h + " h" + (r ? " " + r + " min" : "") : r + " min"; },
      walk: function (h) { return "~" + h + " h walking"; }
    }
  };

  var TYPE_COLORS = {
    "Hike": "#2e7d32", "Walk": "#e0a100", "Summit": "#6d4c41", "Lake": "#1565c0",
    "Gorge": "#6a1b9a", "Waterfall": "#00838f", "Town": "#ad1457", "Scenic train": "#c62828"
  };

  var params = new URLSearchParams(location.search);
  var state = {
    lang: params.get("lang") || ((navigator.language || "").toLowerCase().indexOf("ja") === 0 ? "ja" : "en"),
    q: "", type: "", region: "", highlight: "", effort: "", crowds: "",
    selected: null
  };
  if (!TEXT[state.lang]) state.lang = "en";

  var places = [];
  var markers = {};
  var map, layers;

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

  function status(p) {
    if (!p.open_until) return { cls: "open", text: t().noClosure };
    var parts = p.open_until.split("-");
    var end = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var days = Math.round((end - now) / DAY);
    var d = t().fmt(end);
    if (days < 0) return { cls: "closed", text: t().closed };
    if (days <= 7) return { cls: "soon", text: t().soon(d) };
    return { cls: "open", text: t().until(d) };
  }

  function matches(p) {
    if (state.type && (!p.type || p.type.key !== state.type)) return false;
    if (state.region && (!p.region || p.region.key !== state.region)) return false;
    if (state.effort && (!p.effort || p.effort.key !== state.effort)) return false;
    if (state.crowds && (!p.crowds || p.crowds.key !== state.crowds)) return false;
    if (state.highlight && !p.highlights.some(function (h) { return h.key === state.highlight; })) return false;
    if (state.q) {
      var hay = [p.name_en, p.name_ja, p.summary_en, p.summary_ja].join(" ").toLowerCase();
      if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
    }
    return true;
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
    var chips = [lab(p.type), lab(p.effort), lab(p.crowds)];
    if (p.from_brugg) chips.push("🚆 " + t().fromBrugg + " " + t().dur(p.from_brugg));
    if (p.walking) chips.push(t().walk(p.walking));
    var links = '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + t().open + "</a>" +
      '<a href="https://www.google.com/maps/search/?api=1&query=' + p.lat + "," + p.lon + '" target="_blank" rel="noopener">' + t().gmaps + "</a>";
    if (p.route) links += '<a href="' + esc(p.route) + '" target="_blank" rel="noopener">' + t().route + "</a>";
    return '<div class="pop"><h3>' + esc(name(p)) + '</h3><div class="alt">' + esc(altName(p)) + "</div>" +
      '<div class="status ' + st.cls + '">' + esc(st.text) + "</div>" +
      '<div class="chips">' + chips.filter(Boolean).map(function (c) { return '<span class="chip">' + esc(c) + "</span>"; }).join("") + "</div>" +
      "<p>" + esc(summary(p)) + '</p><div class="links">' + links + "</div></div>";
  }

  function renderList(visible) {
    var list = document.getElementById("list");
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
      return '<li class="card" tabindex="0" data-id="' + p.id + '"' + (state.selected === p.id ? ' aria-current="true"' : "") + ">" +
        '<div class="row1"><span class="emoji">' + esc(p.type ? p.type.emoji : "📍") + "</span>" +
        '<div><div class="name">' + esc(name(p)) + '</div><div class="alt">' + esc(altName(p)) + "</div></div></div>" +
        '<div class="meta"><span class="status ' + st.cls + '">' + esc(st.text) + "</span>" +
        meta.map(function (m) { return "<span>" + esc(m) + "</span>"; }).join("") + "</div>" +
        '<p class="sum">' + esc(summary(p)) + "</p></li>";
    }).join("");
  }

  function fillSelect(id, key, getter, multi) {
    var sel = document.getElementById(id);
    var seen = {}, opts = [];
    places.forEach(function (p) {
      var vals = multi ? getter(p) : [getter(p)];
      vals.forEach(function (v) { if (v && !seen[v.key]) { seen[v.key] = 1; opts.push(v); } });
    });
    opts.sort(function (a, b) { return a[state.lang].localeCompare(b[state.lang], state.lang); });
    sel.innerHTML = '<option value="">' + esc(t().all[key]) + "</option>" + opts.map(function (o) {
      return '<option value="' + esc(o.key) + '"' + (state[key] === o.key ? " selected" : "") + ">" + esc(lab(o)) + "</option>";
    }).join("");
    sel.classList.toggle("active", !!state[key]);
  }

  function renderChrome() {
    document.documentElement.lang = state.lang;
    document.getElementById("title").textContent = t().title;
    document.getElementById("q").placeholder = t().search;
    document.getElementById("reset").textContent = t().reset;
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
    document.getElementById("count").textContent = t().count(visible.length, places.length);
    renderList(visible);
    places.forEach(function (p) {
      var m = markers[p.id];
      var show = visible.indexOf(p) >= 0;
      if (show && !map.hasLayer(m)) m.addTo(map);
      if (!show && map.hasLayer(m)) m.remove();
      m.setPopupContent(popupHtml(p));
    });
  }

  function select(id, opts) {
    opts = opts || {};
    var prev = state.selected;
    state.selected = id;
    if (prev && markers[prev]) markers[prev].setIcon(pinIcon(byId(prev), false));
    var p = byId(id);
    if (!p) return;
    var m = markers[id];
    m.setIcon(pinIcon(p, true));
    m.setZIndexOffset(1000);
    document.querySelectorAll(".card").forEach(function (c) {
      if (c.dataset.id === id) {
        c.setAttribute("aria-current", "true");
        if (opts.scroll !== false) c.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        c.removeAttribute("aria-current");
      }
    });
    if (opts.fly !== false) {
      if (!map.hasLayer(m)) m.addTo(map);
      var target = L.latLng(p.lat, p.lon);
      if (map.getZoom() >= 13 && map.getCenter().distanceTo(target) < 50) {
        m.openPopup();
      } else {
        map.once("moveend", function () { m.openPopup(); });
        map.flyTo(target, Math.max(map.getZoom(), 13), { duration: 1.1 });
      }
    }
    if (history.replaceState) history.replaceState(null, "", location.pathname + location.search + "#" + id);
  }

  function byId(id) {
    for (var i = 0; i < places.length; i++) if (places[i].id === id) return places[i];
    return null;
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
  }

  function addLayerControl() {
    var base = {}, over = {};
    base[t().satellite] = layers.sat;
    base[t().topo] = layers.topo;
    over[t().trails] = layers.trails;
    layers.control = L.control.layers(base, over, { position: "topright" }).addTo(map);
  }

  function initMap() {
    var attr = '&copy; <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">swisstopo</a>';
    var wmts = "https://wmts.geo.admin.ch/1.0.0/";
    layers = {
      sat: L.tileLayer(wmts + "ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg", { maxZoom: 19, attribution: attr }),
      topo: L.tileLayer(wmts + "ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg", { maxZoom: 18, attribution: attr }),
      trails: L.tileLayer(wmts + "ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png", { maxZoom: 18, opacity: 0.85, attribution: attr })
    };
    map = L.map("map", { zoomControl: true, layers: [layers.sat] });
    addLayerControl();
    L.control.scale({ imperial: false }).addTo(map);
    L.marker(BRUGG, {
      icon: L.divIcon({ className: "", html: '<div class="pin home">🏠</div>', iconSize: [28, 28], iconAnchor: [14, 14] }),
      title: "Brugg", keyboard: false
    }).addTo(map).bindTooltip(function () { return t().home; });

    places.forEach(function (p) {
      var m = L.marker([p.lat, p.lon], { icon: pinIcon(p, false), title: p.name_en, riseOnHover: true });
      m.bindPopup("", { autoPanPadding: [30, 30] });
      m.on("click", function () { select(p.id, { fly: false }); });
      markers[p.id] = m;
    });
    map.fitBounds(L.latLngBounds(places.map(function (p) { return [p.lat, p.lon]; })).extend(BRUGG), { padding: [30, 30] });
  }

  function bindUi() {
    var list = document.getElementById("list");
    list.addEventListener("click", function (e) {
      var card = e.target.closest(".card");
      if (card) select(card.dataset.id, { scroll: false });
    });
    list.addEventListener("keydown", function (e) {
      var card = e.target.closest(".card");
      if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(card.dataset.id, { scroll: false }); }
    });
    document.getElementById("q").addEventListener("input", function (e) { state.q = e.target.value.trim(); render(); });
    [["f-type", "type"], ["f-region", "region"], ["f-highlight", "highlight"], ["f-effort", "effort"], ["f-crowds", "crowds"]].forEach(function (pair) {
      document.getElementById(pair[0]).addEventListener("change", function (e) {
        state[pair[1]] = e.target.value;
        e.target.classList.toggle("active", !!e.target.value);
        render();
      });
    });
    document.getElementById("reset").addEventListener("click", function () {
      state.q = state.type = state.region = state.highlight = state.effort = state.crowds = "";
      document.getElementById("q").value = "";
      renderChrome();
      render();
    });
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.addEventListener("click", function () { if (b.dataset.lang !== state.lang) setLang(b.dataset.lang); });
    });
  }

  fetch("places.json", { cache: "no-cache" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      places = data.places;
      initMap();
      bindUi();
      renderChrome();
      render();
      var hash = location.hash.slice(1);
      if (hash && byId(hash)) select(hash);
    })
    .catch(function (err) {
      document.getElementById("list").innerHTML = '<li class="empty">Could not load places.json: ' + esc(err.message) + "</li>";
    });
})();
