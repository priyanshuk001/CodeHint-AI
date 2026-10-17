/**
 * GeeksforGeeks adapter for CodeHint AI.
 * Problem pages: geeksforgeeks.org/problems/<slug>/<number>
 *
 * GeeksforGeeks class names have a random ending (like "problems_problem_content__Xm_eO"),
 * so the selectors below only match the first part. If the problem is read badly, open
 * DevTools (F12), find the element that wraps the problem text, and add it to rootSelectors.
 */
(function () {
  var U = window.CodeHintUtils;
  var E = window.CodeHintEditors;

  window.CodeHintSites.register({
    id: "gfg",
    name: "GeeksforGeeks",
    matches: function (url) {
      return /^https:\/\/(www|practice)\.geeksforgeeks\.org\/problems\//.test(url);
    },
    getProblem: function () {
      return U.problemFromRoot({
        rootSelectors: [
          '[class*="problems_problem_content"]',
          '[class*="problem-statement"]',
          ".problem-statement",
          "main",
        ],
        titleSelectors: [
          '[class*="problems_header_content"] h3',
          '[class*="problems_header_content"] h1',
          "h3",
          "h1",
        ],
        topicSelectors: ['[class*="problems_tag"] a', '[class*="problems_tags"] a'],
        languageSelectors: ['[class*="language"] select', '[class*="lang"] select'],
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
