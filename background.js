importScripts("vendor/puter.js");

const PUTER_SYNC_KEYS = ["puterAuthToken", "puterAppId", "puterUser"];

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
    max_tokens: 700,
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

  return String(response).trim();
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

async function handleSingleAiRequest(payload) {
  const prompt = buildSingleQuestionPrompt(payload.question, payload.answers);
  const text = await callPuterChat(prompt);

  if (!text) {
    throw new Error("Puter AI returned an empty response.");
  }

  return { answer: text };
}

async function handleBatchAiRequest(payload) {
  if (!Array.isArray(payload.questionsDataArray) || payload.questionsDataArray.length === 0) {
    return { answers: [] };
  }

  const prompt = buildBatchPrompt(payload.questionsDataArray);
  const rawText = await callPuterChat(prompt);
  const normalizedText = stripMarkdownCodeFence(rawText);

  let parsedAnswers;
  try {
    parsedAnswers = JSON.parse(normalizedText);
  } catch (error) {
    console.error("Background: Failed to parse Puter batch response as JSON.", normalizedText, error);
    throw new Error(`Could not parse Puter AI batch response. Raw: ${normalizedText}`);
  }

  if (!Array.isArray(parsedAnswers) || !parsedAnswers.every((answer) => typeof answer === "string")) {
    throw new Error("Puter AI batch response was not a JSON array of strings.");
  }

  if (parsedAnswers.length !== payload.questionsDataArray.length) {
    throw new Error("Puter AI batch response count did not match the number of questions sent.");
  }

  return { answers: parsedAnswers };
}

function sendProcessPageMessage(tabId, showAnswers) {
  chrome.tabs.sendMessage(
    tabId,
    { action: "processPage", showAnswers },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Background Error: Could not send message to tab.",
          chrome.runtime.lastError.message,
        );
      } else {
        console.log("Background: Message sent to tab, response:", response);
      }
    },
  );
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
      sendProcessPageMessage(tabs[0].id, showAnswers);
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

  return false;
});
