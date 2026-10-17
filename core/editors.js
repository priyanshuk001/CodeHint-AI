/**
 * CodeHint AI - editor access for site adapters (isolated world).
 *
 * Usage inside an adapter:
 *   const code = window.CodeHintEditors.getCode();
 *   const ok   = window.CodeHintEditors.setCode("print('hi')");
 *   const lang = window.CodeHintEditors.getLanguage();   // raw name like "c_cpp" or "python"
 *
 * All three accept an optional CSS selector to limit the search to one editor,
 * for example getCode("#my-editor-box").
 *
 * The real work is done by core/page-bridge.js. If the bridge does not answer,
 * we fall back to the biggest visible <textarea>.
 */
(function () {
  var REQ = "data-codehint-req";
  var RES = "data-codehint-res";

  function call(request) {
    try {
      var root = document.documentElement;
      root.removeAttribute(RES);
      root.setAttribute(REQ, JSON.stringify(request));
      document.dispatchEvent(new Event("codehint-request"));
      var raw = root.getAttribute(RES);
      root.removeAttribute(REQ);
      root.removeAttribute(RES);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function biggestTextarea() {
    var best = null;
    var bestArea = 0;
    document.querySelectorAll("textarea").forEach(function (el) {
      if (el.disabled || el.readOnly || el.closest('[id^="codehint-"]')) return;
      var r = el.getBoundingClientRect();
      var a = r.width * r.height;
      if (r.width > 40 && r.height > 20 && a > bestArea) {
        best = el;
        bestArea = a;
      }
    });
    return best;
  }

  window.CodeHintEditors = {
    getCode: function (selector) {
      var res = call({ op: "get", selector: selector || "" });
      if (res && res.ok) return res.code || "";
      var ta = biggestTextarea();
      return ta ? ta.value : "";
    },

    setCode: function (code, selector) {
      var res = call({ op: "set", code: code, selector: selector || "" });
      if (res && res.ok) return true;
      var ta = biggestTextarea();
      if (!ta) return false;
      var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(ta, code);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },

    getLanguage: function (selector) {
      var res = call({ op: "info", selector: selector || "" });
      return res && res.ok ? res.language || "" : "";
    },
  };
})();
