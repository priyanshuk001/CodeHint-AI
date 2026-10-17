/**
 * Codeforces adapter for CodeHint AI.
 * Problem pages: problemset/problem/..., contest/<id>/problem/..., gym/<id>/problem/...
 *
 * Note: Codeforces does not allow AI help during a live contest. Use it for practice.
 */
(function () {
  var U = window.CodeHintUtils;
  var E = window.CodeHintEditors;

  function getProblem() {
    var statement = U.$(".problem-statement");

    // Not a normal problem page (for example a PDF-only problem): use the generic reader.
    if (!statement) {
      return U.problemFromRoot({
        rootSelectors: ["#pageContent", "main"],
        titleSelectors: [".title", "h1"],
        languageSelectors: ['select[name="programTypeId"]'],
      });
    }

    var title = U.text(U.$(".header .title", statement));

    // Time / memory limits, for example "time limit per test: 1 second"
    var limits = ["time-limit", "memory-limit"]
      .map(function (name) {
        return U.text(U.$(".header ." + name, statement)).replace(/\n+/g, ": ");
      })
      .filter(Boolean)
      .join("\n");

    // Description = legend + input/output specification + note (not the sample tests)
    var pieces = [];
    Array.prototype.forEach.call(statement.children, function (child) {
      var cls = child.className || "";
      if (/(^|\s)(header|sample-tests)(\s|$)/.test(cls)) return;
      var t = U.text(child);
      if (t) pieces.push(t);
    });

    // Sample tests: pair every input with its output
    var inputs = U.$$(".sample-tests .input pre", statement);
    var outputs = U.$$(".sample-tests .output pre", statement);
    var examples = inputs.map(function (inEl, i) {
      return {
        id: i + 1,
        content: "Input:\n" + U.text(inEl) + "\nOutput:\n" + U.text(outputs[i]),
      };
    });

    // Difficulty (rating, shown like "*800") and topics are in the right sidebar
    var difficulty = "";
    var topics = [];
    U.$$(".tag-box").forEach(function (el) {
      var label = U.text(el);
      if (!label) return;
      if (el.getAttribute("title") === "Difficulty" || /^\*\d{3,4}$/.test(label)) {
        difficulty = label.replace("*", "");
      } else if (topics.indexOf(label) === -1 && label.length < 40) {
        topics.push(label);
      }
    });

    var language =
      U.languageFromPage(['select[name="programTypeId"]']) ||
      U.recognizeLanguage(E.getLanguage());

    return U.buildProblem({
      title: title,
      difficulty: difficulty ? "Rating " + difficulty : "",
      description: U.clip(pieces.join("\n\n")),
      examples: examples,
      constraints: limits,
      topics: topics,
      language: language,
    });
  }

  window.CodeHintSites.register({
    id: "codeforces",
    name: "Codeforces",
    matches: function (url) {
      return /^https:\/\/codeforces\.com\/(problemset\/problem|contest\/\d+\/problem|gym\/\d+\/problem)\//.test(url);
    },
    getProblem: getProblem,
    getCode: function () {
      return E.getCode();
    },
    setCode: function (code) {
      return E.setCode(code);
    },
  });
})();
