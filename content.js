// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "getProblemDetails") {
    const problemDetails = extractProblemDetails();
    sendResponse({ problemDetails: problemDetails });
  } else if (request.action === "getCurrentCode") {
    const code = extractCurrentCode();
    sendResponse({ code: code });
  } else if (request.action === "insertCode") {
    const success = insertCodeToEditor(request.code);
    sendResponse({ success: success });
  } else if (request.action === "getTestCases") {
    const testCases = extractTestCases();
    sendResponse({ testCases: testCases });
  } else if (request.action === "getSubmissionResults") {
    const results = extractSubmissionResults();
    sendResponse({ results: results });
  } else if (request.action === "showNotification") {
    showNotification(request.message, request.type || "info");
    sendResponse({ success: true });
  }

  // Return true to indicate we will send a response asynchronously
  return true;
});


// ---------------------------------------------------------------------------
// Site adapter bridge: the panel never reads a website directly.
// It asks the adapter of the current site (see core/registry.js and sites/*.js).
// ---------------------------------------------------------------------------
function getSite() {
  return window.CodeHintSites ? window.CodeHintSites.getActive() : null;
}

function extractProblemDetails() {
  const site = getSite();
  if (!site) return null;
  const problem = site.getProblem();
  return problem ? { ...problem, site: site.name } : problem;
}

function extractCurrentCode() {
  const site = getSite();
  return site ? site.getCode() : "";
}

function extractTestCases() {
  const site = getSite();
  return site && site.getTestCases ? site.getTestCases() : [];
}

function extractSubmissionResults() {
  const site = getSite();
  return site && site.getSubmissionResults ? site.getSubmissionResults() : null;
}

function insertCodeToEditor(code) {
  const site = getSite();
  return site ? site.setCode(code) : false;
}

let codeHintState = {
  lastResponse: "",
  lastModel: "",
  requestId: 0, // lets us ignore an old answer when a newer request was started
};

// Floating button: which edge it sits on, and how far down (0 = top, 1 = bottom).
const CODEHINT_BUTTON_SIZE = 46;
const CODEHINT_EDGE_GAP = 12;
let codeHintButtonPos = { side: "right", topRatio: 0.17 };

// Timer shown while we wait for the AI.
let codeHintTimer = { id: null, startedAt: 0 };

/**
 * Injects a fixed assistant launcher and side panel on supported problem pages.
 */
function injectAssistantShell() {
  // Only inject on supported problem pages
  if (!getSite()) {
    return;
  }

  // Check if the UI already exists to avoid duplicates
  if (document.getElementById("codehint-assistant-button")) {
    return;
  }

  const styles = document.createElement("style");
  styles.id = "codehint-assistant-styles";
  styles.textContent = `
    :root {
      --chai-bg: #f8fafc;
      --chai-surface: #ffffff;
      --chai-text: #172033;
      --chai-muted: #64748b;
      --chai-border: #dbe4ee;
      --chai-primary: #2563eb;
      --chai-primary-strong: #1d4ed8;
      --chai-accent: #0f766e;
      --chai-danger: #dc2626;
      --chai-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
    }

    #codehint-assistant-button {
      position: fixed;
      top: 146px;
      right: 22px;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      width: 46px;
      height: 46px;
      border-radius: 12px;
      background: linear-gradient(135deg, #2563eb, #0f766e);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      box-shadow: 0 10px 30px rgba(37, 99, 235, 0.28);
      z-index: 10000;
      padding: 0;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      border: 1px solid rgba(255, 255, 255, 0.45);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #codehint-assistant-button:hover {
      transform: translateY(-1px);
      box-shadow: 0 14px 34px rgba(37, 99, 235, 0.34);
    }

    #codehint-assistant-button.codehint-open {
      background: #172033;
    }

    /* after you let go, the button glides to the nearest screen edge */
    #codehint-assistant-button.codehint-snapping {
      transition: left 0.22s ease, top 0.22s ease, transform 0.2s ease, box-shadow 0.2s ease;
    }

    #codehint-assistant-button.codehint-dragging {
      cursor: grabbing;
      transition: none;
      transform: scale(1.08);
      box-shadow: 0 18px 40px rgba(37, 99, 235, 0.4);
    }

    .codehint-button-mark {
      font-size: 20px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0;
    }

    #codehint-assistant-panel {
      position: fixed;
      top: 12px;
      left: 12px;
      /* real size and place are set by positionAssistantPanel() so it sits beside the button */
      width: min(420px, calc(100vw - 24px));
      height: min(660px, calc(100vh - 24px));
      display: flex;
      flex-direction: column;
      background: var(--chai-surface);
      border: 1px solid var(--chai-border);
      border-radius: 8px;
      box-shadow: var(--chai-shadow);
      z-index: 10000;
      color: var(--chai-text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
      transform: scale(0.94);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease, transform 0.18s ease;
    }

    #codehint-assistant-panel.codehint-open {
      opacity: 1;
      transform: scale(1);
      pointer-events: auto;
    }

    .codehint-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      background: #f8fafc;
      border-bottom: 1px solid var(--chai-border);
      flex: 0 0 auto;
    }

    .codehint-title {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .codehint-logo {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: #ffffff;
      background: linear-gradient(135deg, #2563eb, #0f766e);
      font-weight: 800;
    }

    .codehint-title strong {
      display: block;
      font-size: 14px;
      line-height: 18px;
      color: var(--chai-text);
    }

    .codehint-title span {
      display: block;
      font-size: 12px;
      line-height: 16px;
      color: var(--chai-muted);
    }

    .codehint-icon-button {
      width: 32px;
      height: 32px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--chai-muted);
      display: grid;
      place-items: center;
      cursor: pointer;
      font-size: 18px;
    }

    .codehint-icon-button:hover {
      background: #eaf0f7;
      color: var(--chai-text);
    }

    .codehint-panel-body {
      padding: 14px 16px 12px;
      overflow: auto;
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      background: var(--chai-bg);
    }

    .codehint-settings {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      margin-bottom: 14px;
      flex: 0 0 auto;
    }

    .codehint-field {
      display: grid;
      gap: 6px;
    }

    .codehint-field label {
      color: var(--chai-muted);
      font-size: 12px;
      font-weight: 700;
    }

    .codehint-input-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }

    .codehint-field select,
    .codehint-field input {
      min-height: 38px;
      border: 1px solid var(--chai-border);
      border-radius: 8px;
      background: #ffffff;
      color: var(--chai-text);
      padding: 8px 10px;
      font-size: 13px;
      outline: none;
    }

    .codehint-field select:focus,
    .codehint-field input:focus {
      border-color: var(--chai-primary);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    .codehint-save {
      min-height: 38px;
      border: 0;
      border-radius: 8px;
      background: var(--chai-text);
      color: #ffffff;
      padding: 0 12px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
    }

    .codehint-actions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
      flex: 0 0 auto;
    }

    .codehint-action {
      position: relative;
      min-height: 38px;
      border: 1px solid var(--chai-border);
      border-radius: 8px;
      background: #ffffff;
      color: var(--chai-text);
      padding: 8px 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
    }

    .codehint-action:hover {
      border-color: rgba(37, 99, 235, 0.45);
      color: var(--chai-primary-strong);
      background: #eef5ff;
    }

    .codehint-action.active {
      border-color: transparent;
      background: var(--chai-primary);
      color: #ffffff;
    }

    .codehint-action::after {
      content: attr(data-tooltip);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 8px);
      width: 210px;
      transform: translateX(-50%) translateY(4px);
      padding: 8px 10px;
      border-radius: 8px;
      background: #172033;
      color: #ffffff;
      font-size: 12px;
      line-height: 1.35;
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
      transition: opacity 0.16s ease 3s, transform 0.16s ease 3s, visibility 0s linear 3s;
      z-index: 1;
    }

    .codehint-action:hover::after {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) translateY(0);
    }

    .codehint-response {
      flex: 1 1 200px;
      min-height: 140px;
      overflow: auto;
      border: 1px solid var(--chai-border);
      border-radius: 8px;
      background: #ffffff;
      padding: 14px;
      color: var(--chai-text);
      font-size: 13px;
      line-height: 1.55;
    }

    .codehint-response.empty {
      display: grid;
      place-items: center;
      color: var(--chai-muted);
      text-align: center;
    }

    .codehint-response pre {
      position: relative;
      overflow: auto;
      background: #0f172a;
      color: #e2e8f0;
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.5;
    }

    .codehint-response code {
      font-family: "Cascadia Code", Consolas, monospace;
    }

    .codehint-meta {
      margin: 8px 0 0;
      flex: 0 0 auto;
      min-height: 16px;
      color: var(--chai-muted);
      font-size: 12px;
    }

    .codehint-footer-actions {
      display: flex;
      gap: 8px;
      flex: 0 0 auto;
      padding: 10px 16px 14px;
      border-top: 1px solid var(--chai-border);
      background: var(--chai-bg);
    }

    /* waiting indicator + timer */
    .codehint-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px;
      color: var(--chai-muted);
      font-size: 13px;
      font-weight: 600;
    }

    .codehint-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #cbd5e1;
      border-top-color: var(--chai-primary);
      border-radius: 50%;
      animation: codehint-spin 0.8s linear infinite;
    }

    .codehint-timer {
      min-width: 38px;
      text-align: center;
      padding: 2px 8px;
      border-radius: 999px;
      background: #e8eef7;
      color: var(--chai-text);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    @keyframes codehint-spin {
      to { transform: rotate(360deg); }
    }

    .codehint-secondary {
      flex: 1;
      min-height: 36px;
      border: 1px solid var(--chai-border);
      border-radius: 8px;
      background: #ffffff;
      color: var(--chai-text);
      cursor: pointer;
      font-size: 13px;
      font-weight: 700;
    }

    .codehint-secondary:hover {
      background: #eef5ff;
      border-color: rgba(37, 99, 235, 0.45);
    }

    .codehint-hidden {
      display: none !important;
    }

    @media (max-width: 768px) {
      .codehint-actions {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `;

  const launcher = document.createElement("button");
  launcher.id = "codehint-assistant-button";
  launcher.type = "button";
  launcher.title = "Toggle CodeHint AI";
  launcher.innerHTML = `<span class="codehint-button-mark">AI</span>`;

  const panel = document.createElement("aside");
  panel.id = "codehint-assistant-panel";
  panel.setAttribute("aria-label", "CodeHint AI");
  panel.innerHTML = `
    <div class="codehint-panel-header">
      <div class="codehint-title">
        <div class="codehint-logo">AI</div>
        <div>
          <strong>CodeHint AI</strong>
          <span>Pick an action and keep coding</span>
        </div>
      </div>
      <button class="codehint-icon-button" id="codehint-close" type="button" title="Close">x</button>
    </div>
    <div class="codehint-panel-body">
      <div class="codehint-settings">
        <div class="codehint-field">
          <label for="codehint-provider">Model Provider</label>
          <select id="codehint-provider">
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <div class="codehint-field">
          <label for="codehint-api-key">API Key</label>
          <div class="codehint-input-row">
            <input id="codehint-api-key" type="password" placeholder="Paste API key" />
            <button class="codehint-save" id="codehint-save" type="button">Save</button>
          </div>
        </div>
      </div>
      <div class="codehint-actions">
        <button class="codehint-action" type="button" data-ai-action="hint" data-tooltip="Gives a small clue without revealing the full solution.">Hint</button>
        <button class="codehint-action" type="button" data-ai-action="approach" data-tooltip="Explains the algorithm idea, steps, and complexity.">Approach</button>
        <button class="codehint-action" type="button" data-ai-action="solution" data-tooltip="Generates a complete code solution for the selected language.">Solution</button>
        <button class="codehint-action" type="button" data-ai-action="optimize" data-tooltip="Improves your current code for speed, memory, and clarity.">Optimize</button>
        <button class="codehint-action" type="button" data-ai-action="debug" data-tooltip="Finds mistakes in your current code and suggests a fix.">Debug</button>
        <button class="codehint-action" type="button" data-ai-action="explain" data-tooltip="Breaks down the problem statement in simple words.">Explain</button>
      </div>
      <div id="codehint-response" class="codehint-response empty">
        Choose an action to generate help for this problem.
      </div>
      <div id="codehint-meta" class="codehint-meta"></div>
    </div>
    <div class="codehint-footer-actions">
      <button class="codehint-secondary" id="codehint-copy" type="button">Copy</button>
      <button class="codehint-secondary" id="codehint-insert" type="button">Insert Code</button>
    </div>
  `;

  document.body.appendChild(styles);
  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  setupAssistantButtonDrag(launcher);
  placeAssistantButton(false);
  loadAssistantButtonPosition();
  window.addEventListener("resize", function () {
    placeAssistantButton(false);
    if (panel.classList.contains("codehint-open")) positionAssistantPanel();
  });

  panel.querySelector("#codehint-close").addEventListener("click", closeAssistantPanel);
  panel.querySelector("#codehint-save").addEventListener("click", saveAssistantSettings);
  panel.querySelector("#codehint-copy").addEventListener("click", copyAssistantResponse);
  panel.querySelector("#codehint-insert").addEventListener("click", insertAssistantCode);
  panel.querySelectorAll("[data-ai-action]").forEach((button) => {
    button.addEventListener("click", () => runAssistantAction(button.dataset.aiAction));
  });

  loadAssistantSettings();
}

function toggleAssistantPanel() {
  const panel = document.getElementById("codehint-assistant-panel");
  const launcher = document.getElementById("codehint-assistant-button");
  positionAssistantPanel(); // place it next to the button before it appears
  const isOpen = panel.classList.toggle("codehint-open");
  launcher.classList.toggle("codehint-open", isOpen);
}

// ---------------------------------------------------------------------------
// Floating button: drag it anywhere, it snaps to the nearest left/right edge,
// remembers its place, and the window always opens beside it.
// ---------------------------------------------------------------------------
function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function getViewportSize() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight,
  };
}

function placeAssistantButton(animate) {
  const launcher = document.getElementById("codehint-assistant-button");
  if (!launcher) return;

  const viewport = getViewportSize();
  const size = CODEHINT_BUTTON_SIZE;
  const gap = CODEHINT_EDGE_GAP;
  const left = codeHintButtonPos.side === "left" ? gap : viewport.width - size - gap;
  const top = clampNumber(
    Math.round(codeHintButtonPos.topRatio * (viewport.height - size)),
    gap,
    viewport.height - size - gap
  );

  launcher.classList.toggle("codehint-snapping", !!animate);
  launcher.style.right = "auto";
  launcher.style.left = left + "px";
  launcher.style.top = top + "px";
}

function loadAssistantButtonPosition() {
  try {
    chrome.storage.local.get("codehintButton", function (data) {
      const saved = data && data.codehintButton;
      if (saved && (saved.side === "left" || saved.side === "right") && typeof saved.topRatio === "number") {
        codeHintButtonPos = { side: saved.side, topRatio: clampNumber(saved.topRatio, 0, 1) };
        placeAssistantButton(false);
      }
    });
  } catch (error) {
    // storage not available: keep the default place
  }
}

function saveAssistantButtonPosition() {
  try {
    chrome.storage.local.set({ codehintButton: codeHintButtonPos });
  } catch (error) {
    // not important
  }
}

function getAssistantButtonBox() {
  const launcher = document.getElementById("codehint-assistant-button");
  const rect = launcher.getBoundingClientRect();
  const left = parseFloat(launcher.style.left);
  const top = parseFloat(launcher.style.top);
  return {
    left: isNaN(left) ? rect.left : left,
    top: isNaN(top) ? rect.top : top,
    width: rect.width || CODEHINT_BUTTON_SIZE,
    height: rect.height || CODEHINT_BUTTON_SIZE,
  };
}

/**
 * Puts the window next to the button and makes it fit the screen:
 * - button on the right  -> window opens to its left (and the other way round)
 * - window is centred on the button, but never leaves the screen
 * - small screens: the window is centred
 */
function positionAssistantPanel() {
  const panel = document.getElementById("codehint-assistant-panel");
  if (!panel || !document.getElementById("codehint-assistant-button")) return;

  const viewport = getViewportSize();
  const margin = 12;
  const gap = 12;
  const width = Math.min(420, viewport.width - margin * 2);
  const height = Math.min(660, viewport.height - margin * 2);
  const box = getAssistantButtonBox();

  let left;
  if (box.left - gap - width >= margin) {
    left = box.left - gap - width; // room on the left of the button
  } else if (box.left + box.width + gap + width <= viewport.width - margin) {
    left = box.left + box.width + gap; // room on the right of the button
  } else {
    left = Math.round((viewport.width - width) / 2); // small screen
  }

  const top = clampNumber(
    Math.round(box.top + box.height / 2 - height / 2),
    margin,
    viewport.height - height - margin
  );

  panel.style.width = width + "px";
  panel.style.height = height + "px";
  panel.style.left = left + "px";
  panel.style.top = top + "px";
  // the window grows out of the button
  panel.style.transformOrigin =
    Math.round(box.left + box.width / 2 - left) + "px " + Math.round(box.top + box.height / 2 - top) + "px";
}

function setupAssistantButtonDrag(launcher) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;
  let pointerId = null;

  launcher.addEventListener("pointerdown", function (event) {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = launcher.getBoundingClientRect();
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    originLeft = rect.left;
    originTop = rect.top;
    pointerId = event.pointerId;
    try {
      launcher.setPointerCapture(pointerId);
    } catch (error) {}
    launcher.classList.remove("codehint-snapping");
  });

  launcher.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 5) return; // a tiny move is still a click

    moved = true;
    launcher.classList.add("codehint-dragging");
    const viewport = getViewportSize();
    const size = CODEHINT_BUTTON_SIZE;
    launcher.style.right = "auto";
    launcher.style.left = clampNumber(originLeft + dx, 0, viewport.width - size) + "px";
    launcher.style.top = clampNumber(originTop + dy, 0, viewport.height - size) + "px";

    const panel = document.getElementById("codehint-assistant-panel");
    if (panel && panel.classList.contains("codehint-open")) positionAssistantPanel();
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    try {
      launcher.releasePointerCapture(pointerId);
    } catch (error) {}
    launcher.classList.remove("codehint-dragging");
    if (!moved) return;

    // remember the nearest edge and the height, then glide there
    const viewport = getViewportSize();
    const size = CODEHINT_BUTTON_SIZE;
    const left = parseFloat(launcher.style.left) || 0;
    const top = parseFloat(launcher.style.top) || 0;
    codeHintButtonPos = {
      side: left + size / 2 < viewport.width / 2 ? "left" : "right",
      topRatio: clampNumber(top / Math.max(1, viewport.height - size), 0, 1),
    };
    saveAssistantButtonPosition();
    placeAssistantButton(true);

    const panel = document.getElementById("codehint-assistant-panel");
    if (panel && panel.classList.contains("codehint-open")) positionAssistantPanel();
  }

  launcher.addEventListener("pointerup", endDrag);
  launcher.addEventListener("pointercancel", endDrag);

  launcher.addEventListener("click", function () {
    if (moved) {
      moved = false; // this click is the end of a drag, not a tap
      return;
    }
    toggleAssistantPanel();
  });
}

function closeAssistantPanel() {
  document.getElementById("codehint-assistant-panel")?.classList.remove("codehint-open");
  document.getElementById("codehint-assistant-button")?.classList.remove("codehint-open");
}

function loadAssistantSettings() {
  chrome.storage.sync.get(["aiProvider", "apiKey"], function (settings) {
    const provider = document.getElementById("codehint-provider");
    const apiKey = document.getElementById("codehint-api-key");

    if (provider && settings.aiProvider) provider.value = settings.aiProvider;
    if (apiKey && settings.apiKey) apiKey.value = settings.apiKey;
  });
}

function getAssistantSettings() {
  return {
    aiProvider: document.getElementById("codehint-provider")?.value || "gemini",
    apiKey: document.getElementById("codehint-api-key")?.value || "",
  };
}

function saveAssistantSettings() {
  const settings = getAssistantSettings();
  chrome.storage.sync.set(settings, function () {
    showNotification("Settings saved.", "success");
  });
}

function formatDuration(ms, precise) {
  const seconds = ms / 1000;
  if (seconds < 60) return (precise ? seconds.toFixed(1) : Math.floor(seconds)) + "s";
  const minutes = Math.floor(seconds / 60);
  return minutes + "m " + String(Math.floor(seconds % 60)).padStart(2, "0") + "s";
}

function stopLoadingTimer() {
  if (!codeHintTimer.id) return 0;
  clearInterval(codeHintTimer.id);
  codeHintTimer.id = null;
  return Date.now() - codeHintTimer.startedAt;
}

function setAssistantLoading(message) {
  const response = document.getElementById("codehint-response");
  const meta = document.getElementById("codehint-meta");
  response.classList.add("empty");
  response.innerHTML =
    '<div class="codehint-loading">' +
    '<span class="codehint-spinner"></span>' +
    '<span class="codehint-loading-text"></span>' +
    '<span class="codehint-timer">0s</span>' +
    "</div>";
  response.querySelector(".codehint-loading-text").textContent = message;
  if (meta) meta.textContent = "";

  // count the seconds while we wait for the AI
  stopLoadingTimer();
  const timerEl = response.querySelector(".codehint-timer");
  codeHintTimer.startedAt = Date.now();
  codeHintTimer.id = setInterval(function () {
    timerEl.textContent = formatDuration(Date.now() - codeHintTimer.startedAt, false);
  }, 250);
}

function setAssistantResponse(content, model) {
  codeHintState.lastResponse = content || "";
  codeHintState.lastModel = model || "";

  const elapsed = stopLoadingTimer();
  const response = document.getElementById("codehint-response");
  const meta = document.getElementById("codehint-meta");
  response.classList.remove("empty");
  response.innerHTML = formatAssistantMarkdown(content || "No response received.");
  response.scrollTop = 0;
  if (meta) {
    meta.textContent = [
      model ? `Generated by ${model}` : "",
      elapsed ? `took ${formatDuration(elapsed, true)}` : "",
    ]
      .filter(Boolean)
      .join(" \u00b7 ");
  }
}

function setAssistantError(message) {
  const elapsed = stopLoadingTimer();
  const response = document.getElementById("codehint-response");
  const meta = document.getElementById("codehint-meta");
  response.classList.remove("empty");
  response.innerHTML = `<strong style="color: var(--chai-danger);">Error</strong><p>${escapeHtml(message)}</p>`;
  if (meta) meta.textContent = elapsed ? `stopped after ${formatDuration(elapsed, true)}` : "";
}

function formatAssistantMarkdown(content) {
  let escaped = escapeHtml(content);

  escaped = escaped.replace(/```(\w+)?\n([\s\S]*?)```/g, function (_match, _language, code) {
    return `<pre><code>${code.trim()}</code></pre>`;
  });
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/\n{2,}/g, "</p><p>");
  escaped = escaped.replace(/\n/g, "<br>");

  return `<p>${escaped}</p>`;
}

function copyAssistantResponse() {
  if (!codeHintState.lastResponse) {
    showNotification("Nothing to copy yet.", "warning");
    return;
  }

  navigator.clipboard.writeText(codeHintState.lastResponse).then(
    () => showNotification("Response copied.", "success"),
    () => showNotification("Could not copy response.", "error")
  );
}

function insertAssistantCode() {
  const code = extractFirstCodeBlock(codeHintState.lastResponse);
  if (!code) {
    showNotification("No code block found in the response.", "warning");
    return;
  }

  const success = insertCodeToEditor(code);
  showNotification(
    success ? "Code inserted successfully." : "Could not insert code.",
    success ? "success" : "error"
  );
}

function extractFirstCodeBlock(content) {
  const codeMatch = String(content || "").match(/```(?:[\w+-]*)\n([\s\S]*?)```/);
  return codeMatch?.[1]?.trim() || "";
}

function runAssistantAction(action) {
  setActiveAssistantAction(action);

  const settings = getAssistantSettings();
  if (!settings.apiKey) {
    setAssistantError("Please paste your API key and click Save first.");
    return;
  }

  chrome.storage.sync.set(settings);
  const requestId = ++codeHintState.requestId;
  setAssistantLoading(`${getActionLabel(action)}...`);

  const problemDetails = extractProblemDetails();
  const code = extractCurrentCode();
  const testCases = extractTestCases();
  const submissionResults = extractSubmissionResults();

  const baseSettings = { ...settings, assistanceType: action };
  let payload;

  if (action === "optimize") {
    if (!code) {
      setAssistantError("Could not read code from the editor.");
      return;
    }
    payload = { action: "optimizeCode", code, problemDetails, settings: baseSettings };
  } else if (action === "debug") {
    if (!code) {
      setAssistantError("Could not read code from the editor.");
      return;
    }
    payload = { action: "debugCode", code, testCases, problemDetails, settings: baseSettings };
  } else {
    payload = {
      action: "getAIHelp",
      problemDetails,
      settings: baseSettings,
    };
  }

  chrome.runtime.sendMessage(payload, function (aiResponse) {
    if (requestId !== codeHintState.requestId) return; // a newer request replaced this one

    if (chrome.runtime.lastError) {
      setAssistantError(chrome.runtime.lastError.message);
      return;
    }

    if (aiResponse?.content) {
      setAssistantResponse(aiResponse.content, aiResponse.model);
      return;
    }

    setAssistantError(aiResponse?.error || "Error getting AI response.");
  });
}

function setActiveAssistantAction(action) {
  document.querySelectorAll("#codehint-assistant-panel [data-ai-action]").forEach((button) => {
    button.classList.toggle("active", button.dataset.aiAction === action);
  });
}

function getActionLabel(action) {
  const labels = {
    hint: "Preparing a hint",
    approach: "Building an approach",
    solution: "Writing a solution",
    optimize: "Optimizing your code",
    debug: "Debugging your code",
    explain: "Explaining the problem",
  };

  return labels[action] || "Thinking";
}

function escapeHtml(unsafe) {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/**
 * Shows a toast notification on the page
 */
function showNotification(message, type = "info") {
  // Check if notification container exists, if not create it
  let notificationContainer = document.getElementById(
    "codehint-notification-container"
  );
  if (!notificationContainer) {
    notificationContainer = document.createElement("div");
    notificationContainer.id = "codehint-notification-container";
    notificationContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(notificationContainer);
  }

  // Create notification element
  const notification = document.createElement("div");
  notification.className = `codehint-notification codehint-notification-${type}`;
  notification.style.cssText = `
    padding: 12px 16px;
    background-color: #333;
    color: white;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    margin-bottom: 10px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 300px;
    animation: codeHintSlideIn 0.3s ease;
    border-left: 4px solid #0a84ff;
  `;

  // Set border color based on notification type
  if (type === "success") {
    notification.style.borderColor = "#28a745";
  } else if (type === "error") {
    notification.style.borderColor = "#dc3545";
  } else if (type === "warning") {
    notification.style.borderColor = "#ffc107";
  }

  // Create notification content
  notification.innerHTML = `
    <div>${message}</div>
    <div class="codehint-notification-close" style="cursor: pointer; margin-left: 12px;">✕</div>
  `;

  // Add to container
  notificationContainer.appendChild(notification);

  // Add close button functionality
  const closeButton = notification.querySelector(
    ".codehint-notification-close"
  );
  closeButton.addEventListener("click", () => {
    notification.style.animation = "codeHintSlideOut 0.3s ease forwards";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  });

  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = "codeHintSlideOut 0.3s ease forwards";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }
  }, 5000);

  // Add animation styles if not already added
  if (!document.getElementById("codehint-notification-styles")) {
    const style = document.createElement("style");
    style.id = "codehint-notification-styles";
    style.textContent = `
      @keyframes codeHintSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes codeHintSlideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Start the in-page assistant. This stays at the END of the file so every
// constant and function above is defined before it runs.
document.addEventListener("DOMContentLoaded", injectAssistantShell);
injectAssistantShell();