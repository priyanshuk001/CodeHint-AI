/**
 * LeetCode adapter for CodeHint AI.
 * Everything that is specific to leetcode.com lives in this file.
 */
(function () {
/**
 * Extract problem details from the LeetCode page
 */
function extractProblemDetails() {
  try {
    // Extract problem title - Updated with multiple selector attempts
    let titleElement = document.querySelector('[data-cy="question-title"]');

    // If the standard selector doesn't work, try alternate selectors
    if (!titleElement || !titleElement.textContent) {
      // Try to find the title in the new UI structure
      titleElement = document.querySelector(".text-title-large a");

      // Additional fallbacks
      if (!titleElement || !titleElement.textContent) {
        titleElement = document.querySelector(
          'div[class*="title"] a[href*="/problems/"]'
        );
      }

      if (!titleElement || !titleElement.textContent) {
        const headings = document.querySelectorAll("h1, h2, h3, h4");
        for (const heading of headings) {
          if (heading.textContent && heading.textContent.includes(".")) {
            titleElement = heading;
            break;
          }
        }
      }
    }

    const title = titleElement
      ? titleElement.textContent.trim()
      : "Unknown Problem";

    // Extract problem ID and slug
    const urlPath = window.location.pathname;
    const problemSlug = urlPath.split("/problems/")[1]?.split("/")[0] || "";
    const problemId =
      document.querySelector(".mr-4 .text-label-1")?.textContent || "";

    // Extract difficulty
    let difficultyElement =
      document.querySelector("[diff]") ||
      document.querySelector(
        ".relative.inline-flex.items-center.justify-center.text-caption.px-2.py-1.gap-1.rounded-full.bg-fill-secondary"
      );

    // Additional selectors for difficulty
    if (!difficultyElement) {
      // Try newer UI selectors
      difficultyElement = document.querySelector("[data-difficulty]");

      if (!difficultyElement) {
        // Look for text containing difficulty keywords
        const difficultyTexts = ["Easy", "Medium", "Hard"];
        const allElements = document.querySelectorAll("div, span");

        for (const element of allElements) {
          const text = element.textContent.trim();
          if (difficultyTexts.some((diff) => text === diff)) {
            difficultyElement = element;
            break;
          }
        }
      }
    }

    let difficulty = "Unknown";
    if (difficultyElement) {
      const diffText = difficultyElement.textContent.trim();
      if (diffText.includes("Easy") || diffText === "Easy") difficulty = "Easy";
      else if (diffText.includes("Medium") || diffText === "Medium")
        difficulty = "Medium";
      else if (diffText.includes("Hard") || diffText === "Hard")
        difficulty = "Hard";
      else difficulty = diffText;
    }

    // Extract problem description
    let descriptionElement =
      document.querySelector('[data-cy="question-content"]') ||
      document.querySelector(".elfjS");

    // Additional selectors for description
    if (!descriptionElement || !descriptionElement.textContent) {
      // Try newer UI selectors
      descriptionElement = document.querySelector(".description");

      if (!descriptionElement) {
        // Try to find content div near the title
        const contentContainer = document.querySelector(
          'div[class*="content"]'
        );
        if (contentContainer) {
          // Find the main content area that's likely to contain the description
          const contentDivs =
            contentContainer.querySelectorAll("div > div > div");
          for (const div of contentDivs) {
            // Look for a div with substantial text content
            if (
              div.textContent &&
              div.textContent.length > 100 &&
              !div.querySelector("textarea, input")
            ) {
              descriptionElement = div;
              break;
            }
          }
        }
      }

      // Last resort - find the largest text block after the title
      if (!descriptionElement && titleElement) {
        const allParagraphs = document.querySelectorAll("p");
        let largestTextBlock = null;
        let maxLength = 0;

        for (const p of allParagraphs) {
          if (p.textContent && p.textContent.length > maxLength) {
            largestTextBlock = p;
            maxLength = p.textContent.length;
          }
        }

        if (largestTextBlock && maxLength > 50) {
          descriptionElement = largestTextBlock;
        }
      }
    }

    const description = descriptionElement
      ? descriptionElement.textContent.trim()
      : "No description available";

    // Extract examples
    const examples = [];
    const exampleBlocks =
      document.querySelectorAll('[data-cy="question-content"] pre') ||
      document.querySelectorAll(".elfjS pre");
    exampleBlocks.forEach((block, index) => {
      examples.push({
        id: index + 1,
        content: block.textContent.trim(),
      });
    });

    // Extract constraints
    let constraintsText = "";
    if (description.includes("Constraints:")) {
      const constraintsPart = description.split("Constraints:")[1];
      constraintsText = constraintsPart.split("Follow-up:")[0].trim();
    }

    // Extract topics/tags
    const topics = [];
    const topicElements = document.querySelectorAll('a[href^="/tag/"]');
    topicElements.forEach((element) => {
      topics.push(element.textContent.trim());
    });

    // Extract function signature and starter code
    const codeEditorContent = extractCodeEditorContent();
    const selectedLanguage = detectSelectedEditorLanguage();
    const { functionSignature, starterCode, language: parsedLanguage } =
      parseCodeEditorContent(codeEditorContent);
    const language = selectedLanguage || parsedLanguage;

    // Create the final result object
    const problemDetails = {
      id: problemId,
      slug: problemSlug,
      title,
      difficulty,
      description,
      examples,
      constraints: constraintsText,
      topics,
      functionSignature,
      starterCode,
      language,
    };

    // Add debug logging
    console.log("CodeHint AI - Extracted problem details:", {
      title,
      difficulty,
      language,
      description: description.substring(0, 100) + "...", // Truncate for logging
    });

    return problemDetails;
  } catch (error) {
    console.error("Error extracting problem details:", error);
    // Log the error details for debugging
    console.error("Error stack:", error.stack);
    return null;
  }
}

/**
 * Extract the content from the code editor
 */
function extractCodeEditorContent() {
  // Try multiple selectors to find the code editor
  const editorSelectors = [
    ".monaco-editor .view-lines",
    ".CodeMirror-code",
    "[data-mode-id]",
    ".view-lines",
  ];

  for (const selector of editorSelectors) {
    const editorElement = document.querySelector(selector);
    if (editorElement) {
      return editorElement.textContent;
    }
  }

  // Fallback to getting all monaco editor content
  const monacoEditors = document.querySelectorAll(".monaco-editor");
  if (monacoEditors.length > 0) {
    return monacoEditors[0].textContent;
  }

  return "";
}

/**
 * Parse the code editor content to extract function signature and starter code
 */
function parseCodeEditorContent(content) {
  if (!content) return { functionSignature: "", starterCode: "", language: "" };

  const lines = content.split("\n").filter((line) => line.trim() !== "");
  let functionSignature = "";
  let language = "";

  // Look for function signature based on language patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // JavaScript/TypeScript function
    if (line.includes("function") && line.includes("(")) {
      functionSignature = line;
      language = "javascript";
      break;
    }
    // Python def
    else if (line.startsWith("def ") && line.includes("(")) {
      functionSignature = line;
      language = "python";
      break;
    }
    // C++ class method
    else if (
      line.includes("class") &&
      lines[i + 1] &&
      lines[i + 1].includes("public:")
    ) {
      language = "cpp";
      for (let j = i + 1; j < lines.length; j++) {
        if (
          lines[j].includes("(") &&
          !lines[j].includes(";") &&
          !lines[j].includes("public:") &&
          !lines[j].includes("private:")
        ) {
          functionSignature = lines[j].trim();
          break;
        }
      }
      if (functionSignature) break;
    }
    // Java/C++ method
    else if (
      (line.includes("public") ||
        line.includes("private") ||
        line.includes("protected")) &&
      line.includes("(") &&
      !line.includes(";")
    ) {
      if (
        content.includes("public:") ||
        content.includes("#include") ||
        content.includes("std::") ||
        content.includes("vector<")
      ) {
        language = "cpp";
      } else {
        language = "java";
      }
      functionSignature = line;
      break;
    }
  }

  // If we still couldn't determine the language, try to guess based on content
  if (!language) {
    if (
      content.includes("function") &&
      (content.includes("var") ||
        content.includes("let") ||
        content.includes("const"))
    ) {
      language = "javascript";
    } else if (content.includes("def ") && content.includes("return")) {
      language = "python";
    } else if (
      content.includes("public class") ||
      content.includes("private class")
    ) {
      language = "java";
    } else if (content.includes("cout") || content.includes("vector<")) {
      language = "cpp";
    }
  }

  return {
    functionSignature,
    starterCode: lines.join("\n"),
    language,
  };
}

function detectSelectedEditorLanguage() {
  const selectors = [
    '[data-e2e-locator="console-select-language"]',
    '[data-cy="lang-select"]',
    'button[aria-haspopup="listbox"]',
    'button[aria-haspopup="menu"]',
    ".language-btn.selected",
    '[data-cy="code-tab"][aria-selected="true"]',
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    for (const element of elements) {
      const language = normalizeLanguageName(element.textContent);
      if (language) return language;
    }
  }

  const possibleControls = document.querySelectorAll(
    "button, [role='button'], [aria-label], [title]"
  );

  for (const element of possibleControls) {
    const text = [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
    ]
      .filter(Boolean)
      .join(" ");
    const language = normalizeLanguageName(text);
    if (language) return language;
  }

  return "";
}

function normalizeLanguageName(text) {
  const value = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();

  if (!value) return "";
  if (value.includes("c++") || value.includes("cpp")) return "C++";
  if (value.includes("python3") || value.includes("python")) return "Python";
  if (value.includes("typescript")) return "TypeScript";
  if (value.includes("javascript")) return "JavaScript";
  if (value.includes("java") && !value.includes("javascript")) return "Java";
  if (value.includes("c#") || value.includes("csharp")) return "C#";
  if (value.includes("golang") || value === "go" || value.includes(" go ")) return "Go";
  if (value.includes("rust")) return "Rust";
  if (value.includes("kotlin")) return "Kotlin";
  if (value.includes("swift")) return "Swift";
  if (value.includes("php")) return "PHP";
  if (value.includes("ruby")) return "Ruby";

  return "";
}

/**
 * Extract current code from the editor
 */
function extractCurrentCode() {
  try {
    // Try to get code from Monaco editor
    const editorContent = extractCodeEditorContent();
    if (editorContent) {
      return editorContent;
    }

    // Try to find the textarea or pre element that contains the code
    const textareas = document.querySelectorAll("textarea");
    for (const textarea of textareas) {
      if (textarea.value && textarea.value.length > 0) {
        return textarea.value;
      }
    }

    // Try to find code in the DOM structure specific to LeetCode
    const codeLines = document.querySelectorAll(".view-line");
    if (codeLines.length > 0) {
      return Array.from(codeLines)
        .map((line) => line.textContent)
        .join("\n");
    }

    return "";
  } catch (error) {
    console.error("Error extracting current code:", error);
    return "";
  }
}

/**
 * Extract test cases from the LeetCode page
 */
function extractTestCases() {
  try {
    const testCases = [];

    // Try to find test cases in the testcase tab (new UI with flexlayout)
    const testcaseTab = document.getElementById("testcase_tab");
    if (testcaseTab) {
      // Find the testcase content area
      const testcaseContent = document.querySelector(".flexlayout__tabset_content");

      // If we found the tab content area, look for the test case input
      if (testcaseContent) {
        const testcaseInput = testcaseContent.querySelector("textarea, [contenteditable='true']");
        if (testcaseInput && testcaseInput.value) {
          testCases.push({
            id: "testcase_1",
            input: testcaseInput.value.trim()
          });
        } else if (testcaseInput && testcaseInput.textContent) {
          testCases.push({
            id: "testcase_1",
            input: testcaseInput.textContent.trim()
          });
        }
      }

      // If we couldn't find the test case in the content area, try other selectors
      if (testCases.length === 0) {
        // Try to find any textarea or editable div in the testcase area
        const testcaseInputs = document.querySelectorAll("textarea, [contenteditable='true']");
        for (const input of testcaseInputs) {
          const inputValue = input.value || input.textContent;
          if (inputValue && inputValue.trim()) {
            testCases.push({
              id: `testcase_${testCases.length + 1}`,
              input: inputValue.trim()
            });
          }
        }
      }
    }

    // Try to find test cases in the testcase tab (alternative UI)
    if (testCases.length === 0) {
      const testcaseTab = document.querySelector(
        '[data-e2e-locator="console-tab-testcase"]'
      );
      if (testcaseTab) {
        const testcaseInputs = document.querySelectorAll(
          '[data-e2e-locator="console-testcase-input"]'
        );
        if (testcaseInputs.length > 0) {
          const testCase = {};
          testcaseInputs.forEach((inputElement) => {
            try {
              // Find the label associated with the input
              const container = inputElement.closest(
                ".flex.h-full.w-full.flex-col.space-y-2"
              );
              const labelElement = container
                ? container.querySelector(".text-xs.font-medium")
                : null;

              if (labelElement) {
                const key = labelElement.textContent.replace("=", "").trim();
                testCase[key] = inputElement.textContent.trim();
              } else {
                console.warn(
                  "Could not find label for testcase input:",
                  inputElement
                );
              }
            } catch (labelError) {
              console.error(
                "Error processing single testcase input:",
                labelError,
                inputElement
              );
            }
          });

          if (Object.keys(testCase).length > 0) {
            testCases.push(testCase);
          }
        }
      }
    }

    // Try to find test cases in the description's examples (older UI / problem view)
    if (testCases.length === 0) {
      const exampleContainer =
        document.querySelector('[data-cy="question-content"]') ||
        document.querySelector(".elfjS");
      if (exampleContainer) {
        const examples = exampleContainer.querySelectorAll("pre"); // Examples are often in <pre> tags
        examples.forEach((exampleBlock, index) => {
          try {
            const text = exampleBlock.textContent.trim();
            const inputMatch = text.match(/Input:\s*([\s\S]*?)(?:Output:|$)/i);
            const outputMatch = text.match(
              /Output:\s*([\s\S]*?)(?:Explanation:|$)/i
            );

            if (inputMatch && inputMatch[1] && outputMatch && outputMatch[1]) {
              const inputText = inputMatch[1].trim();
              const outputText = outputMatch[1].trim();
              testCases.push({
                id: `example_${index + 1}`,
                input: inputText,
                output: outputText,
              });
            }
          } catch (exampleError) {
            console.error(
              `Error parsing example ${index + 1}:`,
              exampleError,
              exampleBlock
            );
          }
        });
      }
    }

    // Log the extracted test cases for debugging
    console.log("CodeHint AI - Extracted test cases:", testCases);

    return testCases;
  } catch (error) {
    // Log the specific error type and message
    console.error(
      `Error extracting test cases (${error.name}): ${error.message}`
    );
    console.error("Error stack:", error.stack);
    return []; // Return empty array on failure
  }
}

/**
 * Extract submission results from the LeetCode page
 */
function extractSubmissionResults() {
  try {
    // Try to find submission results in the new UI with flexlayout
    const resultTab = document.getElementById("result_tab");
    if (resultTab) {
      // Check if the result tab is selected
      const isResultTabSelected = document.querySelector(".flexlayout__tab_button--selected #result_tab");

      // If the result tab is not selected, we need to click it to see the results
      if (!isResultTabSelected && resultTab.closest(".flexlayout__tab_button")) {
        resultTab.closest(".flexlayout__tab_button").click();
      }

      // Find the result content area
      const resultContent = document.querySelector(".flexlayout__tabset_content");
      if (resultContent) {
        const resultText = resultContent.textContent.trim();

        // Check for success or error messages
        const isSuccess =
          resultText.includes("Accepted") ||
          resultText.includes("Success") ||
          resultText.includes("Output:") ||
          resultText.includes("Expected:") && resultText.includes("Output:") && !resultText.includes("Wrong Answer");

        const isError =
          resultText.includes("Error") ||
          resultText.includes("Wrong Answer") ||
          resultText.includes("Runtime Error") ||
          resultText.includes("Time Limit Exceeded");

        // Try to extract runtime and memory information
        const runtimeMatch = resultText.match(/Runtime:\s*([\d.]+\s*[a-z]+)/i);
        const memoryMatch = resultText.match(/Memory:\s*([\d.]+\s*[a-z]+)/i);

        const runtime = runtimeMatch ? runtimeMatch[1] : "";
        const memory = memoryMatch ? memoryMatch[1] : "";

        // Try to extract error details
        let errorMessage = "";
        if (isError) {
          // Look for specific error patterns
          const errorPatterns = [
            /Wrong Answer([\s\S]*?)(?=Runtime:|$)/i,
            /Runtime Error([\s\S]*?)(?=Runtime:|$)/i,
            /Time Limit Exceeded([\s\S]*?)(?=Runtime:|$)/i
          ];

          for (const pattern of errorPatterns) {
            const match = resultText.match(pattern);
            if (match && match[1]) {
              errorMessage = match[1].trim();
              break;
            }
          }

          // If no specific pattern matched, use a general approach
          if (!errorMessage) {
            // Try to extract the part between the error type and runtime info
            const errorStart = Math.max(
              resultText.indexOf("Wrong Answer"),
              resultText.indexOf("Runtime Error"),
              resultText.indexOf("Time Limit Exceeded")
            );

            if (errorStart !== -1) {
              const runtimeStart = resultText.indexOf("Runtime:");
              if (runtimeStart !== -1 && runtimeStart > errorStart) {
                errorMessage = resultText.substring(errorStart, runtimeStart).trim();
              } else {
                errorMessage = resultText.substring(errorStart).trim();
              }
            }
          }
        }

        return {
          status: isSuccess ? "success" : isError ? "error" : "unknown",
          message: resultText,
          errorDetails: errorMessage,
          runtime,
          memory,
        };
      }
    }

    // Try the alternative UI if the new UI didn't work
    const resultElement = document.querySelector(
      '[data-e2e-locator="console-result"]'
    );
    if (resultElement) {
      const result = resultElement.textContent.trim();

      // Check for success or error messages
      const isSuccess =
        result.includes("Accepted") || result.includes("Success");
      const isError =
        result.includes("Error") || result.includes("Wrong Answer");

      // Get detailed error message if available
      const errorDetails =
        document.querySelector(".text-red-60") ||
        document.querySelector(".text-red-s");
      const errorMessage = errorDetails ? errorDetails.textContent.trim() : "";

      // Get runtime and memory usage if available
      const runtimeElement = document.querySelector('div:contains("Runtime:")');
      const memoryElement = document.querySelector('div:contains("Memory:")');

      const runtime = runtimeElement ? runtimeElement.textContent.trim() : "";
      const memory = memoryElement ? memoryElement.textContent.trim() : "";

      return {
        status: isSuccess ? "success" : isError ? "error" : "unknown",
        message: result,
        errorDetails: errorMessage,
        runtime,
        memory,
      };
    }

    // Log that we couldn't find any results
    console.log("CodeHint AI - No submission results found");
    return null;
  } catch (error) {
    console.error("Error extracting submission results:", error);
    console.error("Error stack:", error.stack);
    return null;
  }
}

/**
 * Insert code into the LeetCode editor
 */
function insertCodeToEditor(code) {
  try {
    // Try multiple approaches to insert code into the editor

    // 1. Try to find the textarea and update its value
    const textareas = document.querySelectorAll("textarea");
    for (const textarea of textareas) {
      if (textarea.value && textarea.value.length > 0) {
        // Save the original value in case we need to restore it
        const originalValue = textarea.value;

        // Update the textarea value
        textarea.value = code;

        // Dispatch input event to trigger Monaco editor update
        const event = new Event("input", { bubbles: true });
        textarea.dispatchEvent(event);

        // If successful, return true
        return true;
      }
    }

    // 2. Try to use Monaco editor's model if available
    if (window.monaco && window.monaco.editor) {
      const editors = window.monaco.editor.getEditors();
      if (editors.length > 0) {
        const model = editors[0].getModel();
        if (model) {
          const fullRange = model.getFullModelRange();
          editors[0].executeEdits("extension", [
            {
              range: fullRange,
              text: code,
            },
          ]);
          return true;
        }
      }
    }

    // 3. Try to use document.execCommand as a fallback
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(code));
      return true;
    }

    // 4. Try to find the editor element and simulate typing
    const editorElement = document.querySelector(".monaco-editor");
    if (editorElement) {
      // Focus the editor
      editorElement.click();

      // Try to select all existing text (Ctrl+A)
      const selectAllEvent = new KeyboardEvent("keydown", {
        key: "a",
        code: "KeyA",
        ctrlKey: true,
        bubbles: true,
      });
      editorElement.dispatchEvent(selectAllEvent);

      // Simulate pasting the code
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", code);

      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: clipboardData,
        bubbles: true,
      });
      editorElement.dispatchEvent(pasteEvent);

      return true;
    }

    return false;
  } catch (error) {
    console.error("Error inserting code:", error);
    return false;
  }
}

  window.CodeHintSites.register({
    id: "leetcode",
    name: "LeetCode",
    matches: (url) => /^https:\/\/leetcode\.com\/problems\//.test(url),
    getProblem: extractProblemDetails,
    getCode: extractCurrentCode,
    setCode: insertCodeToEditor,
    getTestCases: extractTestCases,
    getSubmissionResults: extractSubmissionResults,
  });
})();
