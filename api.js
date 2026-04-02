function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response) {
        reject(new Error("No response received from the extension background worker."));
        return;
      }

      resolve(response);
    });
  });
}

async function getAiAnswer(question, answers) {
  if (!question || !Array.isArray(answers) || answers.length === 0) {
    return "Error: Missing question text or answer options.";
  }

  try {
    const response = await sendMessageToBackground({
      action: "puterAiSingle",
      payload: {
        question,
        answers,
      },
    });

    if (!response.success) {
      console.error("Puter AI Error:", response.error);
      return `Error: ${response.error}`;
    }

    return response.answer;
  } catch (error) {
    console.error("Error sending single Puter AI request to background:", error);
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function getAiAnswersForBatch(questionsDataArray) {
  if (!questionsDataArray || questionsDataArray.length === 0) {
    console.debug("getAiAnswersForBatch: No questions provided.");
    return { answers: [] };
  }

  try {
    const response = await sendMessageToBackground({
      action: "puterAiBatch",
      payload: {
        questionsDataArray,
      },
    });

    if (!response.success) {
      console.error("Puter AI Batch Error:", response.error);
      return { error: `Error: ${response.error}` };
    }

    return { answers: response.answers || [] };
  } catch (error) {
    console.error("Error sending Puter batch AI request to background:", error);
    return {
      error: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
