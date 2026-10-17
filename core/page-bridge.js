/**
 * CodeHint AI - page bridge (runs in the PAGE's own JavaScript world).
 *
 * Why this file exists: Chrome extensions run in an "isolated world" and cannot
 * see objects created by the website, like window.monaco or an Ace editor.
 * This small script runs inside the page (manifest: "world": "MAIN"), so it can
 * read and write the code editor. core/editors.js talks to it.
 *
 * How they talk (all synchronous, no messaging):
 *   1. editors.js writes a JSON request into the attribute data-codehint-req of <html>
 *   2. editors.js fires a "codehint-request" event on document
 *   3. this script handles it and writes a JSON answer into data-codehint-res
 *   4. editors.js reads the answer right away
 *
 * Supported editors: Monaco, Ace, CodeMirror 5, CodeMirror 6, plain <textarea>.
 */
(function () {
  if (window.__codehintBridgeLoaded) return;
  window.__codehintBridgeLoaded = true;

  var root = document.documentElement;
  var REQ = "data-codehint-req";
  var RES = "data-codehint-res";

  function rect(el) {
    try {
      return el.getBoundingClientRect();
    } catch (e) {
      return { width: 0, height: 0 };
    }
  }

  function isVisible(el) {
    var r = rect(el);
    return r.width > 40 && r.height > 20;
  }

  function area(el) {
    var r = rect(el);
    return r.width * r.height;
  }

  // ---- Monaco (LeetCode, maybe CodeChef) ---------------------------------
  function monacoEditors() {
    var out = [];
    try {
      var list =
        window.monaco && window.monaco.editor && window.monaco.editor.getEditors
          ? window.monaco.editor.getEditors()
          : [];
      list.forEach(function (ed) {
        var node = ed.getDomNode && ed.getDomNode();
        if (!node) return;
        out.push({
          kind: "monaco",
          el: node,
          get: function () {
            return ed.getValue();
          },
          set: function (code) {
            var model = ed.getModel();
            if (!model) return false;
            ed.pushUndoStop();
            ed.executeEdits("codehint", [
              { range: model.getFullModelRange(), text: code, forceMoveMarkers: true },
            ]);
            ed.pushUndoStop();
            return true;
          },
          lang: function () {
            var m = ed.getModel();
            if (!m) return "";
            return m.getLanguageId ? m.getLanguageId() : m.getModeId ? m.getModeId() : "";
          },
          focused: function () {
            return !!(ed.hasTextFocus && ed.hasTextFocus());
          },
        });
      });
    } catch (e) {}
    return out;
  }

  // ---- Ace (Codeforces, GeeksforGeeks, InterviewBit, CodeChef IDE) ---------
  function aceEditors() {
    var out = [];
    document.querySelectorAll(".ace_editor").forEach(function (el) {
      try {
        var ed = (el.env && el.env.editor) || (window.ace && window.ace.edit ? window.ace.edit(el) : null);
        if (!ed || !ed.getValue) return;
        out.push({
          kind: "ace",
          el: el,
          get: function () {
            return ed.getValue();
          },
          set: function (code) {
            ed.setValue(code, -1);
            return true;
          },
          lang: function () {
            try {
              return String(ed.session.getMode().$id || "").replace("ace/mode/", "");
            } catch (e) {
              return "";
            }
          },
          focused: function () {
            return !!(ed.isFocused && ed.isFocused());
          },
        });
      } catch (e) {}
    });
    return out;
  }

  // ---- CodeMirror 5 --------------------------------------------------------
  function codeMirror5Editors() {
    var out = [];
    document.querySelectorAll(".CodeMirror").forEach(function (el) {
      var cm = el.CodeMirror;
      if (!cm || !cm.getValue) return;
      out.push({
        kind: "codemirror5",
        el: el,
        get: function () {
          return cm.getValue();
        },
        set: function (code) {
          cm.setValue(code);
          return true;
        },
        lang: function () {
          var mode = cm.getOption("mode");
          return typeof mode === "string" ? mode : (mode && mode.name) || "";
        },
        focused: function () {
          return !!(cm.hasFocus && cm.hasFocus());
        },
      });
    });
    return out;
  }

  // ---- CodeMirror 6 --------------------------------------------------------
  function codeMirror6Editors() {
    var out = [];
    document.querySelectorAll(".cm-content").forEach(function (content) {
      var view = content.cmView && content.cmView.view;
      if (!view || !view.state || !view.state.doc) return;
      out.push({
        kind: "codemirror6",
        el: content.closest(".cm-editor") || content,
        get: function () {
          return view.state.doc.toString();
        },
        set: function (code) {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
          return true;
        },
        lang: function () {
          return "";
        },
        focused: function () {
          return !!view.hasFocus;
        },
      });
    });
    return out;
  }

  // ---- Plain textarea (Codeforces submit box, simple editors) --------------
  function textareaEditors() {
    var out = [];
    document.querySelectorAll("textarea").forEach(function (el) {
      if (el.closest(".monaco-editor, .ace_editor, .CodeMirror, .cm-editor")) return;
      if (el.closest('[id^="codehint-"]')) return;
      if (el.disabled || el.readOnly) return;
      out.push({
        kind: "textarea",
        el: el,
        get: function () {
          return el.value;
        },
        set: function (code) {
          var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
          setter.call(el, code); // works with React-style pages too
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        },
        lang: function () {
          return "";
        },
        focused: function () {
          return document.activeElement === el;
        },
      });
    });
    return out;
  }

  // ---- Choose the editor the user is working in ------------------------------
  function candidates(selector) {
    var all = [].concat(
      monacoEditors(),
      aceEditors(),
      codeMirror5Editors(),
      codeMirror6Editors(),
      textareaEditors()
    );

    if (selector) {
      var scope = document.querySelector(selector);
      all = all.filter(function (c) {
        return scope && (scope === c.el || scope.contains(c.el) || c.el.contains(scope));
      });
    }

    return all.filter(function (c) {
      return isVisible(c.el);
    });
  }

  function pick(selector) {
    var list = candidates(selector);
    if (!list.length) return null;

    var focused = list.filter(function (c) {
      return c.focused && c.focused();
    });
    if (focused.length) return focused[0];

    // Prefer real code editors over plain textareas, then the biggest one.
    list.sort(function (a, b) {
      var ra = a.kind === "textarea" ? 1 : 0;
      var rb = b.kind === "textarea" ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return area(b.el) - area(a.el);
    });
    return list[0];
  }

  document.addEventListener("codehint-request", function () {
    var res = { ok: false, error: "unknown" };
    try {
      var req = JSON.parse(root.getAttribute(REQ) || "{}");
      var ed = pick(req.selector);

      if (!ed) {
        res = { ok: false, error: "no-editor" };
      } else if (req.op === "get") {
        res = { ok: true, kind: ed.kind, code: ed.get(), language: ed.lang() };
      } else if (req.op === "set") {
        res = { ok: !!ed.set(String(req.code == null ? "" : req.code)), kind: ed.kind };
      } else if (req.op === "info") {
        res = { ok: true, kind: ed.kind, language: ed.lang() };
      }
    } catch (e) {
      res = { ok: false, error: String((e && e.message) || e) };
    }
    root.setAttribute(RES, JSON.stringify(res));
  });
})();
