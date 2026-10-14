/* Wegemo embeddable order button — vanilla JS, no dependencies.
 * Usage on an external site:
 *   <div data-wegemo="restaurant-slug" data-table="0" data-label="🛒 Commander"
 *        data-color="#1D1D1F" data-text-color="#ffffff" data-name="Mon Restaurant"></div>
 *   <script src="https://your-domain.com/embed.js"></script>
 */
(function () {
  "use strict";

  // Resolve the origin from this script's own src.
  var current =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      return s[s.length - 1];
    })();
  var ORIGIN = "";
  try {
    ORIGIN = new URL(current.src).origin;
  } catch (e) {
    ORIGIN = window.location.origin;
  }

  function injectStyles() {
    if (document.getElementById("__wegemo_styles__")) return;
    var style = document.createElement("style");
    style.id = "__wegemo_styles__";
    style.textContent = [
      "@keyframes __wgm_fadein{from{opacity:0}to{opacity:1}}",
      "@keyframes __wgm_slideup{from{transform:translateY(100%)}to{transform:translateY(0)}}",
      ".__wgm_btn{display:inline-flex;align-items:center;gap:8px;padding:14px 22px;border-radius:999px;",
      "font-family:Figtree,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:700;font-size:16px;",
      "border:none;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.18);transition:transform .15s ease}",
      ".__wgm_btn:hover{transform:translateY(-2px)}",
      ".__wgm_overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483646;",
      "display:flex;align-items:flex-end;justify-content:center;animation:__wgm_fadein .2s ease}",
      ".__wgm_sheet{position:relative;width:100%;max-width:480px;height:88vh;background:#fff;",
      "border-radius:20px 20px 0 0;overflow:hidden;animation:__wgm_slideup .28s cubic-bezier(.2,.8,.2,1)}",
      ".__wgm_sheet iframe{width:100%;height:100%;border:none}",
      ".__wgm_close{position:absolute;top:12px;right:12px;z-index:2;width:36px;height:36px;border-radius:50%;",
      "background:rgba(0,0,0,.55);color:#fff;font-size:20px;line-height:36px;text-align:center;cursor:pointer}",
    ].join("");
    document.head.appendChild(style);
  }

  function openSheet(rid, table) {
    var overlay = document.createElement("div");
    overlay.className = "__wgm_overlay";

    var sheet = document.createElement("div");
    sheet.className = "__wgm_sheet";

    var close = document.createElement("div");
    close.className = "__wgm_close";
    close.textContent = "✕";

    var iframe = document.createElement("iframe");
    iframe.setAttribute("allow", "payment");
    iframe.src = ORIGIN + "/r/" + encodeURIComponent(rid) + "/t/" + encodeURIComponent(table || 0);

    function destroy() {
      document.removeEventListener("keydown", onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function onKey(e) {
      if (e.key === "Escape") destroy();
    }

    close.addEventListener("click", destroy);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) destroy();
    });
    document.addEventListener("keydown", onKey);

    sheet.appendChild(close);
    sheet.appendChild(iframe);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
  }

  function mount(el) {
    if (el.__wgm_mounted) return;
    el.__wgm_mounted = true;

    var rid = el.getAttribute("data-wegemo");
    var table = el.getAttribute("data-table") || "0";
    var label = el.getAttribute("data-label") || "🛒 Commander";
    var color = el.getAttribute("data-color") || "#1D1D1F";
    var textColor = el.getAttribute("data-text-color") || "#ffffff";

    var btn = document.createElement("button");
    btn.className = "__wgm_btn";
    btn.textContent = label;
    btn.style.background = color;
    btn.style.color = textColor;
    btn.addEventListener("click", function () {
      openSheet(rid, table);
    });

    el.appendChild(btn);
  }

  function init() {
    injectStyles();
    var nodes = document.querySelectorAll("[data-wegemo]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
