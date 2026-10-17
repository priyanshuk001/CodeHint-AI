/**
 * InterviewBit adapter for CodeHint AI.
 * Problem pages: interviewbit.com/problems/<slug>/
 *
 * If the problem is read badly, open DevTools (F12), find the element that wraps
 * the problem text, and add its selector to rootSelectors below.
 */
(function () {
  var U = window.CodeHintUtils;
  var E = window.CodeHintEditors;

  window.CodeHintSites.register({
    id: "interviewbit",
    name: "InterviewBit",
    matches: function (url) {
      return /^https:\/\/www\.interviewbit\.com\/problems\//.test(url);
    },
    getProblem: function () {
      return U.problemFromRoot({
        rootSelectors: [
          ".p-statement",
          ".problem-statement",
          '[class*="problem-description"]',
          "#problem-description",
          '[class*="problem__description"]',
          "main",
        ],
        titleSelectors: ['[class*="problem-title"]', '[class*="problem__title"]', "h1"],
        topicSelectors: ['[class*="tag"] a'],
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
