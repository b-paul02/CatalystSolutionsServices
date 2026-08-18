// Tier layer — runs INSIDE each demo site. Reads ?tier=n and turns the page into
// that tier's version: Tier 1 is bare presence, Tier 2 lights up booking/WhatsApp/
// reviews, Tier 3 adds the AI assistant, locations bar and campaign strip.
// Config arrives as window.__TIER_LAYER, injected per-site by build-demo-sites.mjs.
(function () {
  var C = window.__TIER_LAYER;
  if (!C || !C.tiers || !C.tiers.length) return;

  /* ---------------- tier state ---------------- */
  var max = C.tiers.length;
  var fromUrl = parseInt(new URLSearchParams(location.search).get("tier"), 10);
  var stored = parseInt(sessionStorage.getItem("tl-tier"), 10);
  var tier = fromUrl || stored || max; // direct visits showcase the full build
  tier = Math.min(Math.max(tier, 1), max);
  try { sessionStorage.setItem("tl-tier", String(tier)); } catch (e) {}

  var widgets = {};
  C.tiers.slice(0, tier).forEach(function (t) { (t.widgets || []).forEach(function (w) { widgets[w] = true; }); });
  var topTier = tier === max;

  /* ---------------- helpers ---------------- */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  var root = el("div", "tl");
  root.style.setProperty("--tl-accent", C.accent);
  document.body.appendChild(root);

  // keep tier on in-site navigation so browsing pages doesn't lose the state
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || /^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) return;
    if (/\.html(\?|$)/i.test(href)) a.href = href.split("?")[0] + "?tier=" + tier;
  }, true);

  /* ---------------- ribbon + in-page switcher ---------------- */
  var pills = C.tiers.map(function (t, i) {
    return '<button class="tl-pill' + (i + 1 === tier ? " on" : "") + '" data-t="' + (i + 1) + '">' + esc(t.short || t.label) + "</button>";
  }).join("");
  var ribbon = el("div", "tl-ribbon",
    '<span class="tl-dot"></span> Demo — viewing ' + esc(C.tiers[tier - 1].label) +
    (max > 1 ? ' <span class="tl-pills">' + pills + "</span>" : ""));
  root.appendChild(ribbon);
  ribbon.addEventListener("click", function (e) {
    var b = e.target.closest(".tl-pill");
    if (!b) return;
    var u = new URL(location.href);
    u.searchParams.set("tier", b.getAttribute("data-t"));
    location.href = u.toString();
  });

  /* ---------------- forms: behave per tier ---------------- */
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (!f || f.closest(".tl")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (widgets.enquiry) {
      alert("Demo booked ✅  In production this enquiry lands in the CRM, gets an instant reply, and a reminder is scheduled. (Nothing was sent — fictional demo.)");
      f.reset();
    } else {
      alert("This form reaches a human inbox — " + C.tiers[0].label + " has no automation. Online booking with instant replies unlocks at " + (C.tiers[1] ? C.tiers[1].label : "the next tier") + ".");
    }
  }, true);

  /* ---------------- Tier 3: campaign hello bar + utility top bar ---------------- */
  if (topTier && max > 1 && C.hello) {
    var hello = el("div", "tl-hello", esc(C.hello) + '<button class="tl-x" aria-label="Dismiss">✕</button>');
    hello.querySelector(".tl-x").onclick = function () { hello.remove(); };
    document.body.insertBefore(hello, document.body.firstChild);
  }
  if (widgets.locations || widgets.dashboard) {
    var locHtml = "";
    if (widgets.locations && C.locations && C.locations.length > 1) {
      locHtml = '<div class="tl-loc"><button>📍 <span class="tl-loc-cur">' + esc(C.locations[0]) + '</span> ▾</button><div class="tl-loc-menu">' +
        C.locations.map(function (l, i) { return '<button data-i="' + i + '"' + (i === 0 ? ' class="on"' : "") + ">" + esc(l) + "</button>"; }).join("") +
        "</div></div>";
    }
    var dashHtml = widgets.dashboard && C.dashHref ? '<a class="tl-dash" href="' + C.dashHref + '" target="_top">Staff Dashboard →</a>' : "";
    if (locHtml || dashHtml) {
      var bar = el("div", "tl-topbar", locHtml + dashHtml);
      document.body.insertBefore(bar, document.body.firstChild);
      var loc = bar.querySelector(".tl-loc");
      if (loc) {
        loc.querySelector("button").onclick = function (e) { e.stopPropagation(); loc.querySelector(".tl-loc-menu").classList.toggle("open"); };
        loc.querySelectorAll(".tl-loc-menu button").forEach(function (b) {
          b.onclick = function () {
            loc.querySelector(".tl-loc-cur").textContent = b.textContent;
            loc.querySelectorAll(".tl-loc-menu button").forEach(function (x) { x.classList.remove("on"); });
            b.classList.add("on");
            loc.querySelector(".tl-loc-menu").classList.remove("open");
          };
        });
        document.addEventListener("click", function () { loc.querySelector(".tl-loc-menu").classList.remove("open"); });
      }
    }
  }

  /* ---------------- panel plumbing ---------------- */
  var openPanel = null;
  function panel(cls, headHtml) {
    var p = el("div", "tl-panel " + cls,
      '<div class="tl-panel-head">' + headHtml + '<span class="tl-demo-tag">DEMO</span><button class="tl-close" aria-label="Close">✕</button></div>');
    p.querySelector(".tl-close").onclick = function () { p.classList.remove("open"); openPanel = null; };
    root.appendChild(p);
    return p;
  }
  function show(p) {
    if (openPanel && openPanel !== p) openPanel.classList.remove("open");
    p.classList.add("open");
    openPanel = p;
  }
  function scrollMsgs(p) { var m = p.querySelector(".tl-msgs"); m.scrollTop = m.scrollHeight; }

  /* ---------------- Tier 2+: booking (sticky bar + slot panel) ---------------- */
  if (widgets.enquiry) {
    var bookP = panel("tl-book",
      '<span class="tl-av">📅</span><div class="tl-who"><b>' + esc(C.bookLabel || "Book a time") + "</b><span>" + esc(C.brand) + "</span></div>");
    var body = el("div", "", "");
    bookP.appendChild(body);
    function renderSlots() {
      body.innerHTML = '<div class="tl-slots">' +
        ["Mon 9:00", "Mon 2:30", "Tue 10:30", "Tue 4:00", "Wed 11:15", "Thu 9:45"].map(function (s) { return "<button>" + s + "</button>"; }).join("") +
        '</div><div class="tl-note">Demo — nothing is sent anywhere.</div>';
      body.querySelectorAll(".tl-slots button").forEach(function (b) {
        b.onclick = function () {
          body.innerHTML = '<div class="tl-book-done"><div class="tl-check">✓</div><b>Confirmed — ' + esc(b.textContent) +
            "</b>A confirmation just went out and a reminder is scheduled 24h before. In production this writes to the calendar and CRM.<br><br><button class=\"tl-again\" style=\"color:" +
            C.accent + ';font-weight:700\">Pick another slot</button></div>';
          body.querySelector(".tl-again").onclick = renderSlots;
        };
      });
    }
    renderSlots();
    var bookBar = el("div", "tl-bookbar", "<b>" + esc(C.bookLabel || "Book a time") + "</b><button>" + esc(C.bookCta || "Pick a slot") + "</button>");
    bookBar.querySelector("button").onclick = function () { show(bookP); };
    root.appendChild(bookBar);
  }

  /* ---------------- Tier 2+: WhatsApp bubble (auto-playing scene) ---------------- */
  if (widgets.whatsapp && C.wa && C.wa.length) {
    var waP = panel("tl-wa",
      '<span class="tl-av" style="background:#25d366">💬</span><div class="tl-who"><b>' + esc(C.brand) + "</b><span>WhatsApp Business · instant text-back</span></div>");
    waP.appendChild(el("div", "tl-msgs"));
    var waMsgs = waP.querySelector(".tl-msgs");
    var waTimer = null;
    function playWa() {
      waMsgs.innerHTML = "";
      clearTimeout(waTimer);
      var i = 0;
      (function step() {
        if (i >= C.wa.length) {
          var again = el("div", "tl-msg evt", '<button style="color:#6ee7b7;font-weight:700">↻ Replay</button>');
          again.querySelector("button").onclick = playWa;
          waMsgs.appendChild(again);
          scrollMsgs(waP);
          return;
        }
        var m = C.wa[i++];
        waMsgs.appendChild(el("div", "tl-msg " + (m.f === "e" ? "evt" : m.f === "b" ? "bot" : "user"), esc(m.t)));
        scrollMsgs(waP);
        waTimer = setTimeout(step, m.f === "e" ? 900 : 1500);
      })();
    }
    var waFab = el("button", "tl-fab tl-fab-wa",
      '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.4 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.3-.1.6.2.3.9 1.5 2 2.4 1.4 1.2 2.5 1.6 2.9 1.7.3.2.5.1.7-.1l1-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.4 0 .1 0 .7-.2 1.2Z"/></svg> WhatsApp us');
    waFab.onclick = function () { show(waP); playWa(); };
    root.appendChild(waFab);
  }

  /* ---------------- Tier 3: AI assistant chat ---------------- */
  if (widgets.chat && C.chat && C.chat.length) {
    var chatP = panel("tl-chat",
      '<span class="tl-av">🤖</span><div class="tl-who"><b>' + esc(C.brand) + " assistant</b><span>● online · replies instantly</span></div>");
    chatP.appendChild(el("div", "tl-msgs"));
    chatP.appendChild(el("div", "tl-chips"));
    var chMsgs = chatP.querySelector(".tl-msgs");
    var chChips = chatP.querySelector(".tl-chips");
    function renderChips() {
      chChips.innerHTML = C.chat.map(function (qa, i) { return '<button data-i="' + i + '">' + esc(qa.q) + "</button>"; }).join("");
    }
    chMsgs.appendChild(el("div", "tl-msg bot", esc(C.chatIntro || "Hi! Ask me anything — I answer instantly, even at 2am.")));
    renderChips();
    chChips.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var qa = C.chat[+b.getAttribute("data-i")];
      chMsgs.appendChild(el("div", "tl-msg user", esc(qa.q)));
      var typing = el("div", "tl-typing", "typing…");
      chMsgs.appendChild(typing);
      scrollMsgs(chatP);
      setTimeout(function () {
        typing.remove();
        chMsgs.appendChild(el("div", "tl-msg bot", esc(qa.a)));
        scrollMsgs(chatP);
      }, 800);
    });
    var chatFab = el("button", "tl-fab tl-fab-chat",
      '<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 5.9 2 10.7c0 2.7 1.4 5.1 3.6 6.7-.1.8-.5 2.1-1.5 3.3 0 0 2.4-.3 4.2-1.5.4-.3.7-.3 1.1-.2.8.2 1.7.3 2.6.3 5.5 0 10-3.9 10-8.6S17.5 2 12 2Z"/></svg> ' + esc(C.chatLabel || "Ask the AI assistant"));
    chatFab.onclick = function () { show(chatP); };
    root.appendChild(chatFab);
  }

  /* ---------------- Tier 2+: live review toasts ---------------- */
  if (widgets.reviews && C.reviews && C.reviews.length) {
    var toast = el("div", "tl-toast", "");
    root.appendChild(toast);
    var ri = 0;
    function cycle() {
      var r = C.reviews[ri++ % C.reviews.length];
      toast.innerHTML = '<div class="tl-stars">★★★★★</div><div class="tl-rev">“' + esc(r.t) + '”</div><div class="tl-by">' + esc(r.n) + " · just now</div>";
      toast.classList.add("show");
      setTimeout(function () { toast.classList.remove("show"); }, 6000);
    }
    setTimeout(cycle, 3500);
    setInterval(cycle, 14000);
  }
})();
