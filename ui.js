const aiAnswerCache = new Map();

function createQuestionCacheKey(questionText, answerTexts) {
  const normalizedQuestion = (questionText || "").trim().replace(/\s+/g, " ");
  const normalizedAnswers = (answerTexts || [])
    .map((answer) => (answer || "").trim().replace(/\s+/g, " "))
    .join("||");
  return `${normalizedQuestion}__${normalizedAnswers}`;
}

function renderAiAnswer(aiAnswerDisplay, answerText, index, sourceLabel = "cache") {
  if (!aiAnswerDisplay || !answerText) {
    return;
  }

  if (answerText.toLowerCase().startsWith("error:")) {
    const friendlyMsg = getFriendlyAiErrorMessage(answerText);
    aiAnswerDisplay.textContent = friendlyMsg || answerText;
    console.error(`NetAcad UI: Error displayed for Q${index + 1} from ${sourceLabel}: ${answerText}`);
    return;
  }

  const multiAnswerSeparator = " /// ";
  if (answerText.includes(multiAnswerSeparator)) {
    const individualAnswers = answerText
      .split(multiAnswerSeparator)
      .map((ans) => ans.trim())
      .filter((ans) => ans.length > 0);
    if (individualAnswers.length > 0) {
      aiAnswerDisplay.innerHTML = "AI Suggestions:<br />- " + individualAnswers.join("<br />- ");
    } else {
      aiAnswerDisplay.textContent = "AI Suggestion: Received multiple answer format but no valid content.";
    }
    return;
  }

  const individualAnswers = answerText
    .split("\n")
    .map((ans) => ans.trim())
    .filter((ans) => ans.length > 0);

  if (individualAnswers.length > 1) {
    aiAnswerDisplay.innerHTML = "AI Suggestions:<br />- " + individualAnswers.join("<br />- ");
  } else if (individualAnswers.length === 1) {
    aiAnswerDisplay.textContent = `AI Suggestion: ${individualAnswers[0]}`;
  } else {
    aiAnswerDisplay.textContent = "AI Suggestion: No valid answer content received.";
  }
}

function createAiAssistantUI(uiContainerId, index) {
  const uiContainer = document.createElement("div");
  uiContainer.id = uiContainerId;
  uiContainer.className = "netacad-ai-assistant-ui";
  uiContainer.style.marginTop = "15px";
  uiContainer.style.padding = "10px";
  uiContainer.style.border = "1px solid #007bff";
  uiContainer.style.borderRadius = "5px";
  uiContainer.style.backgroundColor = "#e7f3ff";
  uiContainer.style.color = "#333";

  const titleElement = document.createElement("h5");
  titleElement.textContent = "AI Assistant";
  titleElement.style.marginTop = "0px";
  titleElement.style.marginBottom = "5px";
  titleElement.style.color = "#0056b3";
  uiContainer.appendChild(titleElement);

  const aiAnswerDisplay = document.createElement("p");
  aiAnswerDisplay.className = "ai-answer-display";
  aiAnswerDisplay.style.margin = "5px 0";
  aiAnswerDisplay.style.fontStyle = "italic";
  aiAnswerDisplay.textContent = "Initializing...";
  uiContainer.appendChild(aiAnswerDisplay);

  const refreshButton = document.createElement("button");
  refreshButton.className = "ai-refresh-button";
  refreshButton.textContent = "Refresh AI Answer";
  refreshButton.style.padding = "6px 12px";
  refreshButton.style.border = "none";
  refreshButton.style.borderRadius = "4px";
  refreshButton.style.backgroundColor = "#007bff";
  refreshButton.style.color = "white";
  refreshButton.style.cursor = "pointer";
  refreshButton.onmouseover = () =>
    (refreshButton.style.backgroundColor = "#0056b3");
  refreshButton.onmouseout = () =>
    (refreshButton.style.backgroundColor = "#007bff");
  uiContainer.appendChild(refreshButton);

  return { uiContainer, aiAnswerDisplay, refreshButton };
}

function extractQuestionAndAnswers(mcqViewElement, index) {
  let questionText = "Question text not found";
  let answerElements = [];
  let questionTextElement = null;

  try {
    if (mcqViewElement && mcqViewElement.shadowRoot) {
      const baseView = mcqViewElement.shadowRoot.querySelector(
        'base-view[type="component"]'
      );
      if (baseView && baseView.shadowRoot) {
        questionTextElement = baseView.shadowRoot.querySelector(
          "div.component__body-inner.mcq__body-inner"
        );
        if (!questionTextElement) {
          questionTextElement =
            baseView.shadowRoot.querySelector(".mcq__prompt");
        }
        if (!questionTextElement) {
          questionTextElement = baseView.shadowRoot.querySelector(".prompt");
        }

        if (questionTextElement) {
          questionText = questionTextElement.innerText.trim();
        } else {
          const potentialElements = Array.from(
            baseView.shadowRoot.querySelectorAll("div, p, span")
          );
          for (const el of potentialElements) {
            const text = el.innerText.trim();
            if (text.length > 20) {
              questionText = text;
              questionTextElement = el;
              console.debug(
                `NetAcad UI: Used generic text search in base-view for question ${
                  index + 1
                }: ${questionText}. Element: <${el.tagName}>`
              );
              break;
            }
          }
          if (!questionTextElement) {
            console.warn(
              `NetAcad UI: Question text element not found via specific or generic selectors in base-view for mcq ${
                index + 1
              }.`
            );
          }
        }
      } else {
        let directQuestionEl = mcqViewElement.shadowRoot.querySelector(
          "div.component__body-inner.mcq__body-inner"
        );
        if (!directQuestionEl) {
          directQuestionEl =
            mcqViewElement.shadowRoot.querySelector(".mcq__prompt");
        }
        if (!directQuestionEl) {
          directQuestionEl = mcqViewElement.shadowRoot.querySelector(".prompt");
        }

        if (directQuestionEl) {
          questionTextElement = directQuestionEl;
          questionText = directQuestionEl.innerText.trim();
        } else {
          const potentialElements = Array.from(
            mcqViewElement.shadowRoot.querySelectorAll("div, p, span")
          );
          for (const el of potentialElements) {
            const text = el.innerText.trim();
            if (text.length > 20) {
              questionText = text;
              questionTextElement = el;
              console.debug(
                `NetAcad UI: Used generic text search directly in mcq-view shadowRoot for question ${
                  index + 1
                }: ${questionText}. Element: <${el.tagName}>`
              );
              break;
            }
          }
          if (!questionTextElement) {
            console.warn(
              `NetAcad UI: Question text element not found in mcq ${
                index + 1
              } (no base-view or text not in mcq-view shadowRoot directly).`
            );
          }
        }
      }
      answerElements = mcqViewElement.shadowRoot.querySelectorAll(
        ".mcq__item-label.js-item-label"
      );
    } else {
      console.warn(
        `NetAcad UI: MCQ View element or its shadowRoot is missing for question ${
          index + 1
        }`
      );
      questionText = "Error: MCQ View element not accessible.";
    }
  } catch (e) {
    console.error(
      `NetAcad UI: Error extracting Q&A for question ${index + 1}:`,
      e,
      mcqViewElement
    );
    questionText = `Error extracting data. Check console.`;
  }
  return { questionText, answerElements, questionTextElement };
}

function processAnswerElements(answerElements, index) {
  let answerTexts = [];
  if (answerElements.length > 0) {
    console.debug("NetAcad UI: Possible Answers:");
    answerElements.forEach((answer, answerIndex) => {
      const ansText = answer.innerText.trim();
      answerTexts.push(ansText);
      console.debug(`NetAcad UI:   ${answerIndex + 1}: ${ansText}`);
    });
  } else {
    console.debug(`NetAcad UI: No answer elements found for question ${index + 1}.`);
  }
  return answerTexts;
}

function updateUiAndLogsPostExtraction(aiAnswerDisplay, questionText, answerTexts, index) {
  console.debug(`NetAcad UI: --- Question ${index + 1} --- Details --- `);
  console.debug("NetAcad UI: Question:", questionText);
  console.debug("NetAcad UI: Answers Extracted:", answerTexts);

  if (answerTexts.length === 0) {
    if (
      questionText !== "Question text not found" &&
      !questionText.startsWith("Error:")
    ) {
      aiAnswerDisplay.textContent =
        "AI Assistant: Question found, but no answer options detected.";
    } else {
      aiAnswerDisplay.textContent = questionText; // Show the extraction error
    }
  }

  if (
    questionText.startsWith("Error:") ||
    questionText === "Question text not found"
  ) {
    aiAnswerDisplay.textContent = questionText;
  }
}

function getOutermostHostElement(node) {
  let currentNode = node;

  while (currentNode) {
    const root = currentNode.getRootNode ? currentNode.getRootNode() : null;
    if (!(root instanceof ShadowRoot) || !root.host) {
      return currentNode;
    }
    currentNode = root.host;
  }

  return null;
}

function injectUi(uiContainer, questionTextElement, mcqViewElement, answerElements, uiContainerId, index) {
  let uiInjected = false;

  const outermostHostElement = mcqViewElement
    ? getOutermostHostElement(mcqViewElement)
    : null;

  if (outermostHostElement && outermostHostElement.parentElement) {
    const existingUiByHost = outermostHostElement.parentElement.querySelector(
      `#${uiContainerId}`
    );
    if (
      existingUiByHost &&
      existingUiByHost.parentElement === outermostHostElement.parentElement
    ) {
      existingUiByHost.remove();
    }

    console.debug(
      `NetAcad UI: Injection (Q ${
        index + 1
      }): Trying to place UI outside NetAcad shadow DOM to avoid clipping.`
    );

    if (outermostHostElement.nextSibling) {
      outermostHostElement.parentElement.insertBefore(
        uiContainer,
        outermostHostElement.nextSibling
      );
      console.debug(
        `NetAcad UI: Injection (Q ${
          index + 1
        }): SUCCESS - Injected after the outermost host element.`
      );
    } else {
      outermostHostElement.parentElement.appendChild(uiContainer);
      console.debug(
        `NetAcad UI: Injection (Q ${
          index + 1
        }): SUCCESS - Appended after the outermost host element.`
      );
    }
    uiInjected = true;
  } else {
    console.debug(
      `NetAcad UI: Injection (Q ${
        index + 1
      }): Could not find an outer host mount point, falling back to previous strategies.`
    );
  }

  if (!uiInjected) {
    const hostElement = mcqViewElement
      ? mcqViewElement.getRootNode().host
      : null;
    console.debug(
      `NetAcad UI: Injection (Q ${
        index + 1
      }): Attempting fallback via hostElement. mcqViewElement present: ${!!mcqViewElement}, hostElement: ${
        hostElement ? `<${hostElement.tagName}>` : "null"
      }`
    );
    if (hostElement && hostElement.parentElement) {
      console.debug(
        `NetAcad UI: Injection (Q ${index + 1}): hostElement.parentElement: ${
          hostElement.parentElement
            ? `<${hostElement.parentElement.tagName}>`
            : "null"
        }`
      );
      // Try to remove existing UI if it was placed here by ID
      const existingUiByHost = hostElement.parentElement.querySelector(
        `#${uiContainerId}`
      );
      if (
        existingUiByHost &&
        existingUiByHost.parentElement === hostElement.parentElement
      ) {
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): Removing existing UI (id: ${uiContainerId}) from hostElement.parentElement.`
        );
        existingUiByHost.remove();
      }

      if (hostElement.nextSibling) {
        hostElement.parentElement.insertBefore(
          uiContainer,
          hostElement.nextSibling
        );
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): SUCCESS - Injected via hostElement.parentElement, before hostElement.nextSibling.`
        );
      } else {
        hostElement.parentElement.appendChild(uiContainer);
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): SUCCESS - Appended via hostElement.parentElement.`
        );
      }
      uiInjected = true;
    } else if (!uiInjected) {
      console.debug(
        `NetAcad UI: Injection (Q ${
          index + 1
        }): SKIPPED - hostElement (found: ${!!hostElement}) or hostElement.parentElement (found: ${!!(
          hostElement && hostElement.parentElement
        )}) is missing.`
      );
      // Try to remove existing UI if it was placed here by ID
      const existingUiInBody = document.body.querySelector(`#${uiContainerId}`);
      if (
        existingUiInBody &&
        existingUiInBody.parentElement === document.body
      ) {
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): Removing existing UI (id: ${uiContainerId}) from document.body.`
        );
        existingUiInBody.remove();
      }

      console.warn(
        `NetAcad UI: Injection (Q ${
          index + 1
        }): CRITICAL FALLBACK - Appending to document.body.`
      );
      document.body.appendChild(uiContainer);
      uiInjected = true;
    }
  }
  return uiInjected;
}

function getFriendlyAiErrorMessage(errorString) {
  // Handles known Puter/AI error patterns
  if (!errorString) return null;
  const normalizedError = errorString.toLowerCase();
  if (normalizedError.includes('503') && normalizedError.includes('overload')) {
    return 'AI Suggestion: The AI provider is overloaded. Please try again later.';
  }
  if (normalizedError.includes('503') && normalizedError.includes('unavailable')) {
    return 'AI Suggestion: The AI provider is currently unavailable (503). Please try again later.';
  }
  if (normalizedError.includes('quota')) {
    return 'AI Suggestion: Your Puter AI quota appears to be exhausted. Please check your Puter usage or try again later.';
  }
  if (
    normalizedError.includes('not signed in') ||
    normalizedError.includes('sign in first') ||
    normalizedError.includes('unauthorized') ||
    normalizedError.includes('authentication')
  ) {
    return 'AI Suggestion: Puter sign-in is required. Open the extension popup and sign in first.';
  }
  if (normalizedError.includes('window closed')) {
    return 'AI Suggestion: The Puter sign-in window was closed before login completed.';
  }
  if (normalizedError.includes('parse')) {
    return 'AI Suggestion: The AI response format was invalid. Please retry once.';
  }
  // Add more patterns as needed
  return null;
}

async function handleRefreshAction(questionText, answerTexts, authToken, aiAnswerDisplay, index) {
  if (!aiAnswerDisplay) return;
  const questionCacheKey = createQuestionCacheKey(questionText, answerTexts);

  if (!authToken) {
    aiAnswerDisplay.textContent =
      "Puter is not signed in. Open the extension popup and sign in first.";
    console.warn(`NetAcad UI: refreshAction for Q${index + 1}: Puter session not available.`);
    return;
  }

  if (
    questionText === "Question text not found" ||
    questionText.startsWith("Error:")
  ) {
    aiAnswerDisplay.textContent = questionText; // Reshow extraction error
    console.warn(
      `NetAcad UI: refreshAction for Q${
        index + 1
      }: Aborted due to question extraction issue: ${questionText}`
    );
    return;
  }
  if (answerTexts.length === 0) {
    aiAnswerDisplay.textContent =
      "AI Assistant: No answer options available to send to AI.";
    console.warn(
      `NetAcad UI: refreshAction for Q${index + 1}: Aborted, no answer texts.`
    );
    return;
  }

  aiAnswerDisplay.textContent = "Asking Puter AI (single refresh)...";
  aiAnswerCache.set(questionCacheKey, { status: "pending" });
  console.debug(
    `NetAcad UI: refreshAction for Q${
      index + 1
    }: Asking Puter AI for question: "${questionText.substring(0, 50)}..."`
  );
  const rawAiResponse = await getAiAnswer(questionText, answerTexts);

  console.debug(
    `NetAcad UI: AI Answer (single refresh) received for Q${index + 1}: '${rawAiResponse}' (Full text)`
  );

  aiAnswerCache.set(questionCacheKey, {
    status: "resolved",
    answer: rawAiResponse,
  });

  if (!aiAnswerDisplay.isConnected) {
    console.debug(
      `NetAcad UI: Q${index + 1} display node was detached before render; requesting re-scrape to restore cached answer.`,
    );
    if (typeof window.scrapeData === "function") {
      setTimeout(() => {
        window.scrapeData();
      }, 0);
    }
    return;
  }

  if (rawAiResponse && rawAiResponse.trim() !== "" && !rawAiResponse.toLowerCase().startsWith("error:")) {
    renderAiAnswer(aiAnswerDisplay, rawAiResponse, index, "single refresh");
  } else if (rawAiResponse && rawAiResponse.toLowerCase().startsWith("error:")) {
    renderAiAnswer(aiAnswerDisplay, rawAiResponse, index, "single refresh");
  } else {
    aiAnswerDisplay.textContent =
      "AI Suggestion: No answer received or answer was empty (single refresh).";
    console.warn(
      `NetAcad UI: AI returned empty or whitespace-only answer for Q${
        index + 1
      } (single refresh). Original response: '${rawAiResponse}'`
    );
  }
}

async function processSingleQuestion(mcqViewElement, index, authToken, preFetchedAiAnswer = null) {
  const uiContainerId = `netacad-ai-q-${index}`;

  // Always attempt to remove old UI from mcqViewElement's shadowRoot first
  if (mcqViewElement && mcqViewElement.shadowRoot) {
    const existingUiInMcqSR = mcqViewElement.shadowRoot.querySelector(
      `#${uiContainerId}`
    );
    if (existingUiInMcqSR) {
      console.debug(
        `NetAcad UI: Removing existing UI (id: ${uiContainerId}) from mcqView SR for Q ${
          index + 1
        }`
      );
      existingUiInMcqSR.remove();
    }
  }
  // Note: Removal from questionTextElement.parentNode is handled during injection phase

  const { uiContainer, aiAnswerDisplay, refreshButton } = createAiAssistantUI(uiContainerId, index);

  // --- 2. Extract Question and Answers ---
  let { questionText, answerElements, questionTextElement } = extractQuestionAndAnswers(mcqViewElement, index);
  
  // --- 3. Process Answer Elements & Update UI based on extraction ---
  let answerTexts = processAnswerElements(answerElements, index);
  const questionCacheKey = createQuestionCacheKey(questionText, answerTexts);
  const cachedAnswerState = aiAnswerCache.get(questionCacheKey);
  updateUiAndLogsPostExtraction(aiAnswerDisplay, questionText, answerTexts, index);

  // --- 4. UI Injection Logic ---
  injectUi(uiContainer, questionTextElement, mcqViewElement, answerElements, uiContainerId, index);

  // --- 5. Refresh Action and Initial Fetch/Status ---
  refreshButton.addEventListener("click", () => 
    handleRefreshAction(questionText, answerTexts, authToken, aiAnswerDisplay, index)
  );

  // Handle AI answer display (pre-fetched or initial call)
  if (preFetchedAiAnswer === "BATCH_PROCESSING_STARTED") {
    aiAnswerDisplay.textContent = "Batch processing... Please wait.";
    console.debug(`NetAcad UI: Q${index + 1} waiting for batched AI answer.`);
  } else if (preFetchedAiAnswer) { // An actual answer or error string is provided
    aiAnswerCache.set(questionCacheKey, { status: "resolved", answer: preFetchedAiAnswer });
    renderAiAnswer(aiAnswerDisplay, preFetchedAiAnswer, index, "pre-fetched data");
  } else if (cachedAnswerState?.status === "resolved" && cachedAnswerState.answer) {
    renderAiAnswer(aiAnswerDisplay, cachedAnswerState.answer, index, "cache");
  } else if (cachedAnswerState?.status === "pending") {
    aiAnswerDisplay.textContent = "Asking Puter AI...";
  } else { // No pre-fetched answer, proceed with individual fetch if Q/A is valid
    if (
      questionText !== "Question text not found" &&
      !questionText.startsWith("Error:") &&
      answerTexts.length > 0 &&
      authToken // Only try if Puter session is present
    ) {
      console.debug(`NetAcad UI: Q${index + 1} making individual call to AI (no pre-fetched answer).`);
      await handleRefreshAction(questionText, answerTexts, authToken, aiAnswerDisplay, index);
    } else if (!authToken && questionText !== "Question text not found" && !questionText.startsWith("Error:") && answerTexts.length > 0) {
      aiAnswerDisplay.textContent = "Error: Puter is not signed in. Open the extension popup and sign in first.";
      console.warn(`NetAcad UI: Q${index + 1} cannot fetch AI answer - Puter session missing.`);
    } else {
      console.debug(`NetAcad UI: Q${index + 1} - Initial AI call skipped due to extraction issues or missing Puter session. Message: ${aiAnswerDisplay.textContent}`);
    }
  }
}
