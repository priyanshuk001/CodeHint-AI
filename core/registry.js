/**
 * Site registry for CodeHint AI.
 *
 * Every supported website (LeetCode, Codeforces, ...) has one "adapter" file in
 * the sites/ folder. An adapter registers itself here. The rest of the extension
 * (panel, AI actions) never talks to a website directly - it only asks the
 * active adapter.
 *
 * An adapter is an object like this:
 *
 *   {
 *     id: "leetcode",                       // short id, lowercase
 *     name: "LeetCode",                     // shown to the user and sent to the AI
 *     matches: (url) => boolean,            // is this a problem page of this site?
 *     getProblem: () => object,             // title, description, examples, constraints...
 *     getCode: () => string,                // the code currently in the editor
 *     setCode: (code) => boolean,           // put code into the editor, true if it worked
 *     getTestCases: () => any,              // optional
 *     getSubmissionResults: () => any,      // optional
 *   }
 */
(function () {
  const sites = [];

  window.CodeHintSites = {
    register(site) {
      if (!site || !site.id || typeof site.matches !== "function") {
        console.error("CodeHint AI: invalid site adapter", site);
        return;
      }
      sites.push(site);
    },

    /** The adapter for the page we are on right now, or null if the site is not supported. */
    getActive() {
      const url = window.location.href;
      return sites.find((site) => site.matches(url)) || null;
    },

    all() {
      return sites.slice();
    },
  };
})();
