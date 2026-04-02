// Constants for retry mechanism
const MAX_SCRAPE_ATTEMPTS = 10;
const SCRAPE_RETRY_DELAY_MS = 1500;
const INDIVIDUAL_AI_CONCURRENCY = 2;

async function processQuestionsIndividually(questionsData, authToken) {
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < questionsData.length) {
      const questionIndex = currentIndex;
      currentIndex += 1;

      const questionData = questionsData[questionIndex];
      await processSingleQuestion(
        questionData.mcqViewElement,
        questionData.originalIndex,
        authToken,
        null,
      );
    }
  }

  const workerCount = Math.min(INDIVIDUAL_AI_CONCURRENCY, questionsData.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
}

async function scrapeData(currentAttempt = 1) {
  console.debug(
    `NetAcad Auto Quiz Assistant (scraper.js): scrapeData attempt #${currentAttempt} of ${MAX_SCRAPE_ATTEMPTS}`
  );

  const storedData = await chrome.storage.sync.get(["puterAuthToken"]);
  const authToken = storedData.puterAuthToken;

  let mcqViewElements = [];
  let earlyExitReason = "";

  try {
    const appRoot = document.querySelector("app-root");
    if (appRoot && appRoot.shadowRoot) {
      const pageView = appRoot.shadowRoot.querySelector("page-view");
      if (pageView && pageView.shadowRoot) {
        const articleViews = pageView.shadowRoot.querySelectorAll("article-view");
        if (articleViews && articleViews.length > 0) {
          articleViews.forEach((articleView, i) => {
            if (articleView.shadowRoot) {
              const blockViews = articleView.shadowRoot.querySelectorAll("block-view");
              blockViews.forEach((blockView, j) => {
                if (blockView.shadowRoot) {
                  const mcqView = blockView.shadowRoot.querySelector("mcq-view");
                  if (mcqView) mcqViewElements.push(mcqView);
                }
              });
            }
          });
          if (mcqViewElements.length === 0) earlyExitReason = "Found article-view(s) but no mcq-view elements.";
        } else earlyExitReason = "page-view found, but no article-view elements.";
      } else earlyExitReason = appRoot.shadowRoot.querySelector("page-view") ? "page-view found, but no shadowRoot." : "page-view not found in app-root.";
    } else earlyExitReason = document.querySelector("app-root") ? "app-root found, but no shadowRoot." : "app-root not found.";
  } catch (e) {
    earlyExitReason = "Exception during shadow DOM traversal.";
    console.error(`NetAcad Auto Quiz Assistant (scraper.js): ${earlyExitReason}`, e);
  }

  if (currentAttempt === 1) {
    document.querySelectorAll(".netacad-ai-assistant-ui[id^='netacad-ai-q-']").forEach((el) => el.remove());
    mcqViewElements.forEach((mcqView) => {
      if (mcqView && mcqView.shadowRoot) {
        mcqView.shadowRoot.querySelectorAll(".netacad-ai-assistant-ui[id^='netacad-ai-q-']").forEach((el) => el.remove());
      }
    });
  }

  if (mcqViewElements.length === 0) {
    let logMessage = `NetAcad Auto Quiz Assistant (scraper.js): Attempt #${currentAttempt}: No mcq-view elements found.`;
    if (earlyExitReason) logMessage += ` Reason: ${earlyExitReason}`;
    else if (currentAttempt === 1) logMessage += ` Shadow DOM traversal completed, but no mcq-view tags were identified.`;
    console.debug(logMessage);

    if (currentAttempt < MAX_SCRAPE_ATTEMPTS) {
      console.debug(`NetAcad Auto Quiz Assistant (scraper.js): Will retry in ${SCRAPE_RETRY_DELAY_MS / 1000}s...`);
      setTimeout(() => { window.scrapeData && window.scrapeData(currentAttempt + 1); }, SCRAPE_RETRY_DELAY_MS);
      return false;
    }
    console.warn(`NetAcad Auto Quiz Assistant (scraper.js): Max retry attempts reached. Failed to find mcq-view elements.`);
    return false;
  }

  console.debug(
    `NetAcad Auto Quiz Assistant (scraper.js): Found ${mcqViewElements.length} mcq-view element(s). Attempting to process...`
  );

  if (!authToken) {
    console.warn("NetAcad Auto Quiz Assistant (scraper.js): Puter session not found. Displaying message in UI.");
    for (const [index, mcqViewElement] of mcqViewElements.entries()) {
      await processSingleQuestion(mcqViewElement, index, null, "Error: Puter is not signed in. Open the extension popup and sign in first.");
    }
    return true; // Processed (by showing error)
  }

  const allQuestionsData = [];
  for (const [index, mcqViewElement] of mcqViewElements.entries()) {
    // extractQuestionAndAnswers is in ui.js and should be globally available.
    // It returns { questionText, answerElements, questionTextElement }
    if (typeof extractQuestionAndAnswers !== 'function') {
        console.error("NetAcad Auto Quiz Assistant (scraper.js): extractQuestionAndAnswers function is not available!");
        // Fallback: process each question individually with an error message, or just skip UI update
        await processSingleQuestion(mcqViewElement, index, authToken, "Error: Core UI function (extract) missing.");
        continue;
    }
    const extractionResult = extractQuestionAndAnswers(mcqViewElement, index);
    const answerTexts = processAnswerElements(extractionResult.answerElements, index);

    if (extractionResult.questionText && !extractionResult.questionText.startsWith("Error") && answerTexts.length > 0) {
      allQuestionsData.push({
        question: extractionResult.questionText,
        answers: answerTexts,
        mcqViewElement: mcqViewElement,
        originalIndex: index,
        questionTextElement: extractionResult.questionTextElement // Needed for UI injection by processSingleQuestion
      });
    } else {
      // If extraction fails for a question, still call processSingleQuestion to render its UI with the error.
      // The error from extractionResult.questionText or lack of answers will be handled by processSingleQuestion.
      console.warn(`NetAcad Auto Quiz Assistant (scraper.js): Failed to extract valid Q&A for question ${index + 1}. Will let processSingleQuestion handle UI error.`);
      await processSingleQuestion(mcqViewElement, index, authToken, extractionResult.questionText); // Pass the extraction error
    }
  }

  if (allQuestionsData.length > 0) {
    console.debug(
      `NetAcad Auto Quiz Assistant (scraper.js): Extracted ${allQuestionsData.length} valid questions. Processing individually with concurrency ${INDIVIDUAL_AI_CONCURRENCY}.`,
    );
    await processQuestionsIndividually(allQuestionsData, authToken);
  } else {
    console.debug("NetAcad Auto Quiz Assistant (scraper.js): No valid questions extracted to send for batch processing.");
    // If there were mcqViewElements but none yielded valid Q&A, their UIs would have been handled
    // in the extraction loop above, displaying individual extraction errors via processSingleQuestion.
  }

  return true;
} 
