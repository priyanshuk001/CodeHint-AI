/**
 * TEMPLATE for a new site adapter. Copy this file, rename it (for example
 * sites/codeforces.js), fill in the functions, then:
 *
 *   1. Add the file to "content_scripts" -> "js" in manifest.json
 *      (after core/registry.js and before content.js).
 *   2. Add the site's URL pattern to "host_permissions" and
 *      "content_scripts" -> "matches" in manifest.json.
 *
 * Tip: open the problem page, press F12, and use the Elements tab to find the
 * right selectors. Websites change often, so keep a few fallback selectors.
 */
(function () {
  function getProblem() {
    // Return the same shape the LeetCode adapter returns, so the AI prompts work:
    // { title, difficulty, description, examples, constraints, topics, language, ... }
    return {
      title: document.querySelector("h1")?.textContent?.trim() || "",
      description: "",
      examples: [],
      constraints: "",
    };
  }

  function getCode() {
    // Return the code that is in the editor right now.
    return "";
  }

  function setCode(code) {
    // Put `code` into the editor. Return true if it worked, false if not.
    // (If it can't work on this site, return false - the user can use the Copy button.)
    return false;
  }

  window.CodeHintSites.register({
    id: "example",
    name: "Example Site",
    matches: (url) => /^https:\/\/example\.com\/problems\//.test(url),
    getProblem,
    getCode,
    setCode,
  });
})();
