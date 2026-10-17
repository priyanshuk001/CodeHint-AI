# CodeHint AI

AI hints, approaches, solutions and debugging help for coding problems, right inside the problem page.
Works with your own OpenAI or Google Gemini API key.

**Supported sites:** LeetCode, Codeforces, CodeChef, GeeksforGeeks, InterviewBit

## Features

- **Hint**: a small clue without spoiling the solution
- **Approach**: the idea, steps and time/space complexity
- **Solution**: full code in the language selected in your editor
- **Optimize**: improve your current code
- **Debug**: find mistakes in your current code
- **Explain**: the problem in simple words
- **Insert Code**: put the AI code into the editor with one click

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Open a problem, click the **AI** button, pick a provider, paste your API key and click **Save**.

Needs Chrome 111 or newer (or Edge / Brave of the same age).

## How the code is organised

```
core/registry.js      list of supported sites; picks the right one for the current page
core/site-utils.js    helpers every site uses (read text, math, language names, ...)
core/editors.js       read / write the code editor (talks to page-bridge.js)
core/page-bridge.js   runs inside the page; reaches Monaco, Ace, CodeMirror and textareas
sites/leetcode.js     LeetCode adapter
sites/codeforces.js   Codeforces adapter
sites/codechef.js     CodeChef adapter
sites/gfg.js          GeeksforGeeks adapter
sites/interviewbit.js InterviewBit adapter
sites/_template.js    copy this to add a new site
content.js            the floating panel and buttons (same for every site)
background.js         talks to OpenAI / Gemini
popup.html/js/css     toolbar popup
config.js             default model settings
```

## Add a new site

1. Copy `sites/_template.js` to `sites/<site>.js`. For a simple site, call
   `CodeHintUtils.problemFromRoot({...})` with a few selectors, like `sites/gfg.js` does.
2. In `manifest.json`, add the site's problem-page URL to `host_permissions` and to both
   `content_scripts` entries, and add the new file to the `js` list of the second entry
   (before `content.js`).

## If a site is not read correctly

Websites change their HTML often. Open the problem page, press F12, find the element that
wraps the problem text, and add its selector to `rootSelectors` in that site's file in `sites/`.
If the title or language is wrong, do the same for `titleSelectors` / `languageSelectors`.

## Privacy

Your API key is stored in your browser. The problem text and your code are sent to the AI provider you choose (OpenAI or Google) to get an answer. Nothing is sent anywhere else.

## Fair use

Many contests, including live Codeforces and CodeChef rounds, do not allow AI help. Use CodeHint AI for practice and learning, and follow each site's rules.

## License

MIT
