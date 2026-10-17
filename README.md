# CodeHint AI

AI hints, approaches, solutions and debugging help for coding problems, right inside the problem page.
Works with your own OpenAI or Google Gemini API key.

**Supported sites:** LeetCode (more coming: Codeforces, CodeChef, GeeksforGeeks, InterviewBit)

## Features

- **Hint**: a small clue without spoiling the solution
- **Approach**: the idea, steps and time/space complexity
- **Solution**: full code in the language selected in your editor
- **Optimize**: improve your current code
- **Debug**: find mistakes in your current code
- **Explain**: the problem in simple words
- **Insert Code**: put the AI code into the editor with one click (where the site allows it)

## Install (developer mode)

1. Download or clone this repository.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Open a problem, click the **AI** button, pick a provider, paste your API key and click **Save**.

## How the code is organised

```
core/registry.js     list of supported sites; picks the right one for the current page
sites/leetcode.js    everything that is specific to LeetCode (read problem, read/write code)
sites/_template.js   copy this to add a new site
content.js           the floating panel and buttons (same for every site)
background.js        talks to OpenAI / Gemini
popup.html/js/css    toolbar popup
config.js            default model settings
```

## Add a new site

1. Copy `sites/_template.js` to `sites/<site>.js` and fill in `getProblem`, `getCode` and `setCode`.
2. In `manifest.json`, add the file to `content_scripts[0].js` (before `content.js`),
   and add the site's URL to `host_permissions` and `content_scripts[0].matches`.

## Privacy

Your API key is stored in your browser. The problem text and your code are sent to the AI provider you choose (OpenAI or Google) to get an answer. Nothing is sent anywhere else.

## Fair use

Many contests do not allow AI help while the contest is running. Use CodeHint AI for practice and learning, and follow each site's rules.

## License

MIT
