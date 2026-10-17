/**
 * CodeHint AI - small helpers shared by all site adapters.
 * Exposes window.CodeHintUtils.
 */
(function () {
  var BLOCK_TAGS = /^(P|DIV|LI|UL|OL|PRE|H[1-6]|TABLE|TR|SECTION|ARTICLE|BLOCKQUOTE|HR|HEADER|FOOTER)$/;
  var MAX_TEXT = 12000;

  function $(selector, scope) {
    try {
      return (scope || document).querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  function $$(selector, scope) {
    try {
      return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function firstElement(selectors, scope) {
    for (var i = 0; i < selectors.length; i++) {
      var el = $(selectors[i], scope);
      if (el) return el;
    }
    return null;
  }

  /**
   * Turns an element into readable text. Keeps line breaks, and keeps math
   * (MathJax / KaTeX) as $...$ instead of garbled duplicate text.
   */
  function text(node) {
    if (!node) return "";
    var out = [];

    function walk(n) {
      if (n.nodeType === 3) {
        var value = n.nodeValue;
        var inPre = n.parentElement && n.parentElement.closest && n.parentElement.closest("pre");
        out.push(inPre ? value : value.replace(/\s+/g, " "));
        return;
      }
      if (n.nodeType !== 1) return;

      var tag = n.tagName;
      var cls = typeof n.className === "string" ? n.className : "";

      if (n.id && n.id.indexOf("codehint-") === 0) return; // our own panel
      if (n.hasAttribute && n.hasAttribute("hidden")) return;
      if (tag === "STYLE" || tag === "NOSCRIPT" || tag === "BUTTON" || tag === "svg") return;

      if (tag === "SCRIPT") {
        var type = n.getAttribute("type") || "";
        if (type.indexOf("math/tex") === 0) out.push("$" + n.textContent + "$");
        return;
      }

      // MathJax v2 draws the formula twice (preview + result); the real source is in the <script>.
      if (/(^|\s)(MathJax_Preview|MathJax_Display|MathJax|MJX_Assistive_MathML)(\s|$)/.test(cls)) return;

      // MathJax v3
      if (tag === "MJX-CONTAINER") {
        var mml = n.querySelector("mjx-assistive-mml");
        out.push(mml ? mml.textContent : "");
        return;
      }

      // KaTeX keeps the original formula in an <annotation> tag.
      if (/(^|\s)katex(\s|$)/.test(cls)) {
        var ann = n.querySelector('annotation[encoding="application/x-tex"]');
        out.push(ann ? "$" + ann.textContent + "$" : n.textContent);
        return;
      }

      if (tag === "BR") {
        out.push("\n");
        return;
      }

      var block = BLOCK_TAGS.test(tag);
      if (block) out.push("\n");
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
      if (block) out.push("\n");
    }

    walk(node);
    return out
      .join("")
      .replace(/ /g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function firstText(selectors, scope) {
    for (var i = 0; i < selectors.length; i++) {
      var el = $(selectors[i], scope);
      var value = el ? text(el) : "";
      if (value) return value;
    }
    return "";
  }

  function clip(value, max) {
    value = String(value || "");
    max = max || MAX_TEXT;
    return value.length > max ? value.slice(0, max) + "\n...(shortened)" : value;
  }

  /** Easy / Medium / Hard / Basic / School, or a number rating like 800 or 1500. */
  function findDifficulty(value) {
    var m = String(value || "").match(
      /Difficulty(?:\s*Rating)?\s*[:\-]?\s*(Easy|Medium|Hard|Basic|School|\*?\d{3,4})/i
    );
    if (m) return m[1].replace("*", "");
    var m2 = String(value || "").match(/\b(Easy|Medium|Hard)\b/);
    return m2 ? m2[1] : "";
  }

  /** "GNU G++17 7.3.0", "c_cpp", "python3", ... -> "C++", "Python", ... Unknown -> "". */
  function recognizeLanguage(raw) {
    var s = String(raw || "").toLowerCase().trim();
    if (!s) return "";
    if (/c\+\+|cpp|g\+\+|clang/.test(s)) return "C++";
    if (/typescript/.test(s)) return "TypeScript";
    if (/javascript|node\.?js|\bjs\b|\bnode\b/.test(s)) return "JavaScript";
    if (/java(?!script)/.test(s)) return "Java";
    if (/python|pypy|\bpy3?\b/.test(s)) return "Python";
    if (/c#|csharp|c_sharp|\bmono\b/.test(s)) return "C#";
    if (/kotlin/.test(s)) return "Kotlin";
    if (/golang|\bgo\b/.test(s)) return "Go";
    if (/rust/.test(s)) return "Rust";
    if (/ruby/.test(s)) return "Ruby";
    if (/swift/.test(s)) return "Swift";
    if (/php/.test(s)) return "PHP";
    if (/scala/.test(s)) return "Scala";
    if (/^c$|\bgcc\b|\bc11\b|\bc99\b|\bc17\b/.test(s)) return "C";
    return "";
  }

  /** Same as recognizeLanguage, but an unknown name is returned as it is. */
  function normalizeLanguage(raw) {
    return recognizeLanguage(raw) || String(raw || "").trim();
  }

  /** Reads a language from a <select> (selected option) or any element with text. */
  function languageFromPage(selectors) {
    for (var i = 0; i < (selectors || []).length; i++) {
      var el = $(selectors[i]);
      if (!el) continue;
      var raw = "";
      if (el.tagName === "SELECT" && el.selectedIndex >= 0) {
        raw = el.options[el.selectedIndex].text;
      } else {
        raw = text(el);
      }
      var lang = recognizeLanguage(raw); // only trust names we know, so a wrong <select> is ignored
      if (lang) return lang;
    }
    return "";
  }

  /**
   * Splits one big block of problem text into description, constraints and examples.
   * Works on the plain text, so it does not depend on a site's HTML.
   */
  function splitProblemText(full) {
    full = String(full || "");
    var sampleAt = full.search(/\n\s*(?:Sample|Example)s?\b/i);
    var description = sampleAt > 0 ? full.slice(0, sampleAt).trim() : full.trim();
    var examplesText = sampleAt > 0 ? full.slice(sampleAt).trim() : "";

    var c = full.match(
      /\n\s*Constraints?\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:Sample|Example|Input|Output|Explanation|Note|Subtasks?|Expected|Your Task)\b|$)/i
    );

    return {
      description: description,
      constraints: c ? c[1].trim() : "",
      examples: examplesText ? [{ id: 1, content: clip(examplesText, 3500) }] : [],
    };
  }

  function slugFromUrl() {
    var parts = window.location.pathname.split("/").filter(Boolean);
    var i = parts.indexOf("problems");
    if (i >= 0 && parts[i + 1]) return parts[i + 1];
    return parts[parts.length - 1] || "";
  }

  /** Builds the object the AI prompts expect (same shape as the LeetCode adapter). */
  function buildProblem(p) {
    return {
      id: p.id || "",
      slug: p.slug || slugFromUrl(),
      title: p.title || "Unknown Problem",
      difficulty: p.difficulty || "Unknown",
      description: p.description || "No description available",
      examples: p.examples || [],
      constraints: p.constraints || "",
      topics: p.topics || [],
      functionSignature: p.functionSignature || "",
      starterCode: p.starterCode || "",
      language: p.language || "",
    };
  }

  /**
   * One-call problem reader for sites where we only know a few selectors.
   * Falls back to <main> / the whole page, so the AI always gets something.
   *
   * options: { rootSelectors, titleSelectors, topicSelectors, languageSelectors }
   */
  function problemFromRoot(options) {
    var root =
      firstElement(options.rootSelectors || []) || $("main") || document.body;
    var full = clip(text(root));
    var parts = splitProblemText(full);

    var title =
      firstText(options.titleSelectors || ["h1"]) ||
      document.title.split(/\s[|\-–]\s/)[0].trim();

    var topics = [];
    (options.topicSelectors || []).forEach(function (selector) {
      $$(selector).forEach(function (el) {
        var t = text(el);
        if (t && topics.indexOf(t) === -1 && t.length < 40) topics.push(t);
      });
    });

    var language =
      languageFromPage(options.languageSelectors) ||
      recognizeLanguage(window.CodeHintEditors ? window.CodeHintEditors.getLanguage() : "");

    return buildProblem({
      title: title,
      difficulty: findDifficulty(full),
      description: parts.description,
      examples: parts.examples,
      constraints: parts.constraints,
      topics: topics,
      language: language,
    });
  }

  window.CodeHintUtils = {
    $: $,
    $$: $$,
    firstElement: firstElement,
    text: text,
    firstText: firstText,
    clip: clip,
    findDifficulty: findDifficulty,
    normalizeLanguage: normalizeLanguage,
    recognizeLanguage: recognizeLanguage,
    languageFromPage: languageFromPage,
    splitProblemText: splitProblemText,
    buildProblem: buildProblem,
    problemFromRoot: problemFromRoot,
  };
})();
