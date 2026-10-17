/**
 * CodeChef adapter for CodeHint AI.
 * Problem pages: codechef.com/problems/<CODE> and codechef.com/<CONTEST>/problems/<CODE>
 *
 * CodeChef class names change often, so this uses "contains" selectors and falls
 * back to reading the whole page. If the problem is read badly, open DevTools (F12),
 * find the element that wraps the problem text, and add its selector to rootSelectors.
 */
(function () {
  var U = window.CodeHintUtils;
  var E = window.CodeHintEditors;

  window.CodeHintSites.register({
    id: "codechef",
    name: "CodeChef",
    matches: function (url) {
      return /^https:\/\/www\.codechef\.com\/(problems\/|[^\/]+\/problems\/)/.test(url);
    },
    getProblem: function () {
      return U.problemFromRoot({
        rootSelectors: [
          "#problem-statement",
          '[class*="problem-statement"]',
          '[class*="problemStatement"]',
          '[class*="problem_statement"]',
          "main",
        ],
        titleSelectors: ['[class*="problem-name"]', '[class*="problemName"]', "h1"],
        topicSelectors: ['[class*="problem-tag"] a', '[class*="tags"] a'],
        languageSelectors: ['[class*="language"] select', "select"],
      });
    },
    getCode: function () {
      return E.getCode();
    },
    setCode: function (code) {
      return E.setCode(code);
    },
  });
})();
