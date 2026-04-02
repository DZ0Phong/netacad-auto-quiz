importScripts("vendor/puter.js");

const PUTER_SYNC_KEYS = ["puterAuthToken", "puterAppId", "puterUser"];
const NETACAD_CONTENT_SCRIPTS = ["api.js", "ui.js", "scraper.js", "content.js"];

async function getStoredPuterSession() {
  return chrome.storage.sync.get(PUTER_SYNC_KEYS);
}

async function hydratePuterSession() {
  const session = await getStoredPuterSession();

  if (session.puterAuthToken) {
    puter.setAuthToken(session.puterAuthToken);
    if (session.puterAppId) {
      puter.setAppID(session.puterAppId);
    }
    return session;
  }

  if (typeof puter.resetAuthToken === "function" && puter.auth?.isSignedIn()) {
    puter.resetAuthToken();
  }

  return session;
}

function buildChatOptions() {
  return {
    model: "openai/gpt-5.4-nano",
    max_tokens: 500,
  };
}

function extractPuterMessageText(response) {
  if (!response) {
    return "";
  }

  if (typeof response === "string") {
    return response.trim();
  }

  if (typeof response.message?.content === "string") {
    return response.message.content.trim();
  }

  if (Array.isArray(response.message?.content)) {
    return response.message.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part?.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  if (typeof response.text === "string") {
    return response.text.trim();
  }

  if (typeof response.content === "string") {
    return response.content.trim();
  }

  if (Array.isArray(response.content)) {
    return response.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part?.text === "string") {
          return part.text;
        }
        if (typeof part?.content === "string") {
          return part.content;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  if (typeof response.toString === "function") {
    const stringValue = response.toString();
    if (typeof stringValue === "string" && stringValue !== "[object Object]") {
      return stringValue.trim();
    }
  }

  if (typeof response === "object") {
    const discoveredText = findFirstTextRecursively(response);
    if (discoveredText) {
      return discoveredText;
    }
  }

  return String(response).trim();
}

function findFirstTextRecursively(value, depth = 0) {
  if (!value || depth > 4) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = findFirstTextRecursively(item, depth + 1);
      if (text) {
        return text;
      }
    }
    return "";
  }

  if (typeof value === "object") {
    for (const key of ["text", "content", "message", "output", "result", "response"]) {
      if (key in value) {
        const text = findFirstTextRecursively(value[key], depth + 1);
        if (text) {
          return text;
        }
      }
    }

    for (const nestedValue of Object.values(value)) {
      const text = findFirstTextRecursively(nestedValue, depth + 1);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function normalizeErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error.message === "string") {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch (jsonError) {
    console.warn("Background: Failed to stringify Puter error.", jsonError);
    return fallbackMessage;
  }
}

function stripMarkdownCodeFence(rawText) {
  if (!rawText) {
    return "";
  }

  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}

function buildSingleQuestionPrompt(question, answers) {
  let prompt = `Given the following multiple-choice question and its possible answers, please choose the best answer(s).
If the question implies multiple correct answers (e.g., 'select all that apply', 'choose N correct options'), return ALL chosen answer texts, each on a new line.
Otherwise, if it's a single-choice question, return only the text of the single best chosen answer option.
Do not add any extra explanation or leading text like "The best answer is: ".

Question:
${question}

Possible Answers:
`;

  answers.forEach((answer, index) => {
    prompt += `${index + 1}. ${answer}\n`;
  });

  return prompt;
}

function buildBatchPrompt(questionsDataArray) {
  let prompt =
    "You will be provided with a JSON array of multiple-choice questions. For each question, choose the best answer(s) from its 'possible_answers'.\n";
  prompt +=
    "If a question implies multiple correct answers (e.g., 'select all that apply', 'choose N correct options'), include all correct answer texts for that question concatenated into a single string, separated by ' /// ' (space, three forward slashes, space).\n";
  prompt +=
    "Otherwise, if it's a single-choice question, return just the single best answer text as the string for that question.\n";
  prompt +=
    "Return only a valid JSON array of strings in the same order as the input. Do not wrap the array in markdown fences and do not add explanation.\n\n";
  prompt += "Questions:\n";
  prompt += JSON.stringify(
    questionsDataArray.map((questionData, index) => ({
      id: `question_${index + 1}`,
      question_text: questionData.question,
      possible_answers: questionData.answers,
    })),
    null,
    2,
  );

  return prompt;
}

async function callPuterChat(prompt) {
  await hydratePuterSession();

  if (!puter.auth?.isSignedIn()) {
    throw new Error("You are not signed in to Puter. Open the extension popup and sign in first.");
  }

  const response = await puter.ai.chat(prompt, buildChatOptions());
  return extractPuterMessageText(response);
}

async function callPuterChatWithRetry(prompt, attempts = 2) {
  let lastText = "";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastText = await callPuterChat(prompt);
    if (lastText) {
      return lastText;
    }
    console.warn(`Background: Puter chat returned empty text on attempt ${attempt}/${attempts}.`);
  }

  return lastText;
}

async function handleSingleAiRequest(payload) {
  const prompt = buildSingleQuestionPrompt(payload.question, payload.answers);
  const text = await callPuterChatWithRetry(prompt);

  if (!text) {
    throw new Error("Puter AI returned an empty response.");
  }

  return { answer: text };
}

function tryParseJsonArrayFromText(rawText) {
  const normalizedText = stripMarkdownCodeFence(rawText);

  if (!normalizedText) {
    return null;
  }

  try {
    return JSON.parse(normalizedText);
  } catch (error) {
    const startIndex = normalizedText.indexOf("[");
    const endIndex = normalizedText.lastIndexOf("]");

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const candidate = normalizedText.slice(startIndex, endIndex + 1);
      try {
        return JSON.parse(candidate);
      } catch (innerError) {
        console.warn("Background: Failed to parse extracted JSON array candidate.", candidate, innerError);
      }
    }
  }

  return null;
}

async function fallbackBatchToIndividualAnswers(questionsDataArray) {
  console.warn("Background: Falling back to individual Puter AI calls for batch request.");
  const answers = [];

  for (const questionData of questionsDataArray) {
    const singleResult = await handleSingleAiRequest(questionData);
    answers.push(singleResult.answer);
  }

  return { answers };
}

async function handleBatchAiRequest(payload) {
  if (!Array.isArray(payload.questionsDataArray) || payload.questionsDataArray.length === 0) {
    return { answers: [] };
  }

  const prompt = buildBatchPrompt(payload.questionsDataArray);
  const rawText = await callPuterChatWithRetry(prompt);
  const parsedAnswers = tryParseJsonArrayFromText(rawText);

  if (!rawText) {
    console.warn("Background: Batch Puter response was empty. Using individual fallback.");
    return fallbackBatchToIndividualAnswers(payload.questionsDataArray);
  }

  if (!Array.isArray(parsedAnswers) || !parsedAnswers.every((answer) => typeof answer === "string")) {
    console.error("Background: Batch Puter response was not a JSON array of strings.", rawText);
    return fallbackBatchToIndividualAnswers(payload.questionsDataArray);
  }

  if (parsedAnswers.length !== payload.questionsDataArray.length) {
    console.error(
      "Background: Batch Puter response count mismatch.",
      parsedAnswers.length,
      payload.questionsDataArray.length,
      rawText,
    );
    return fallbackBatchToIndividualAnswers(payload.questionsDataArray);
  }

  return { answers: parsedAnswers };
}

function sendProcessPageMessage(tabId, showAnswers) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: "processPage", showAnswers },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      },
    );
  });
}

async function injectNetacadScripts(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: NETACAD_CONTENT_SCRIPTS,
  });
}

async function processPageOnTab(tabId, showAnswers) {
  try {
    const response = await sendProcessPageMessage(tabId, showAnswers);
    return response || {
      success: false,
      error: "No response from page after sending process command.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldReinject =
      message.includes("Could not establish connection") ||
      message.includes("Receiving end does not exist");

    if (!shouldReinject) {
      throw error;
    }

    console.warn(
      "Background: Content script connection missing. Re-injecting scripts and retrying.",
      message,
    );
    await injectNetacadScripts(tabId);
    const response = await sendProcessPageMessage(tabId, showAnswers);
    return response || {
      success: false,
      error: "No response from page after re-injecting content scripts.",
    };
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command !== "process-page-command") {
    return;
  }

  console.log("Command received: process-page-command");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length || !tabs[0].id) {
      console.warn("Background: No active tab found.");
      return;
    }

    chrome.storage.sync.get(["showAnswers"], (result) => {
      const showAnswers = typeof result.showAnswers === "boolean" ? result.showAnswers : true;
      processPageOnTab(tabs[0].id, showAnswers)
        .then((response) => {
          console.log("Background: process-page command result:", response);
        })
        .catch((error) => {
          console.error("Background: process-page command failed.", error);
        });
    });
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPuterSession") {
    getStoredPuterSession()
      .then((session) => sendResponse({ success: true, session }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: normalizeErrorMessage(error, "Failed to load Puter session."),
        }),
      );
    return true;
  }

  if (request.action === "clearPuterSession") {
    chrome.storage.sync.remove(PUTER_SYNC_KEYS, async () => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }

      if (typeof puter.resetAuthToken === "function") {
        try {
          puter.resetAuthToken();
        } catch (error) {
          console.warn("Background: Failed to clear in-memory Puter session.", error);
        }
      }

      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === "puterAiSingle") {
    handleSingleAiRequest(request.payload)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: normalizeErrorMessage(error, "Single Puter AI request failed."),
        }),
      );
    return true;
  }

  if (request.action === "puterAiBatch") {
    handleBatchAiRequest(request.payload)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: normalizeErrorMessage(error, "Batch Puter AI request failed."),
        }),
      );
    return true;
  }

  if (request.action === "processPageOnActiveTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length || !tabs[0].id) {
        sendResponse({
          success: false,
          error: "Could not find active tab.",
        });
        return;
      }

      processPageOnTab(tabs[0].id, request.showAnswers !== false)
        .then((response) => {
          sendResponse(response || { success: true, result: true });
        })
        .catch((error) =>
          sendResponse({
            success: false,
            error: normalizeErrorMessage(error, "Failed to process page on active tab."),
          }),
        );
    });
    return true;
  }

  return false;
});
