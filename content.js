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

// Inject the in-page assistant when the page loads.
document.addEventListener("DOMContentLoaded", injectAssistantShell);
injectAssistantShell();

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
};

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
      width: 46px;
      height: 46px;
      border-radius: 12px;
      background: linear-gradient(135deg, #2563eb, #0f766e);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 10px 30px rgba(37, 99, 235, 0.28);
      z-index: 10000;
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

    .codehint-button-mark {
      font-size: 20px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0;
    }

    #codehint-assistant-panel {
      position: fixed;
      top: 140px;
      right: 82px;
      width: min(420px, calc(100vw - 28px));
      max-height: calc(100vh - 112px);
      background: var(--chai-surface);
      border: 1px solid var(--chai-border);
      border-radius: 8px;
      box-shadow: var(--chai-shadow);
      z-index: 10000;
      color: var(--chai-text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
      transform: translateY(-8px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    #codehint-assistant-panel.codehint-open {
      opacity: 1;
      transform: translateY(0);
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
      padding: 14px 16px 16px;
      overflow: auto;
      max-height: calc(100vh - 176px);
      background: var(--chai-bg);
    }

    .codehint-settings {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      margin-bottom: 14px;
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
      min-height: 190px;
      max-height: 380px;
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
      min-height: 16px;
      color: var(--chai-muted);
      font-size: 12px;
    }

    .codehint-footer-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
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
      #codehint-assistant-button {
        top: 132px;
        right: 14px;
      }

      #codehint-assistant-panel {
        top: 186px;
        right: 14px;
      }

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
      <div class="codehint-footer-actions">
        <button class="codehint-secondary" id="codehint-copy" type="button">Copy</button>
        <button class="codehint-secondary" id="codehint-insert" type="button">Insert Code</button>
      </div>
    </div>
  `;

  document.body.appendChild(styles);
  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  launcher.addEventListener("click", toggleAssistantPanel);
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
  const isOpen = panel.classList.toggle("codehint-open");
  launcher.classList.toggle("codehint-open", isOpen);
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

function setAssistantLoading(message) {
  const response = document.getElementById("codehint-response");
  const meta = document.getElementById("codehint-meta");
  response.classList.add("empty");
  response.textContent = message;
  if (meta) meta.textContent = "";
}

function setAssistantResponse(content, model) {
  codeHintState.lastResponse = content || "";
  codeHintState.lastModel = model || "";

  const response = document.getElementById("codehint-response");
  const meta = document.getElementById("codehint-meta");
  response.classList.remove("empty");
  response.innerHTML = formatAssistantMarkdown(content || "No response received.");
  if (meta) meta.textContent = model ? `Generated by ${model}` : "";
}

function setAssistantError(message) {
  const response = document.getElementById("codehint-response");
  const meta = document.getElementById("codehint-meta");
  response.classList.remove("empty");
  response.innerHTML = `<strong style="color: var(--chai-danger);">Error</strong><p>${escapeHtml(message)}</p>`;
  if (meta) meta.textContent = "";
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
