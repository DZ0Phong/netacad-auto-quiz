document.addEventListener("DOMContentLoaded", () => {
  const sessionInfo = document.getElementById("sessionInfo");
  const openPuterAuthButton = document.getElementById("openPuterAuth");
  const signOutPuterButton = document.getElementById("signOutPuter");
  const processPageButton = document.getElementById("processPage");
  const statusDiv = document.getElementById("status");
  const showAnswersToggle = document.getElementById("showAnswersToggle");
  const processOnSwitchToggle = document.getElementById("processOnSwitchToggle");

  function setStatus(message, clearAfterMs = 0) {
    statusDiv.textContent = message;
    if (clearAfterMs > 0) {
      setTimeout(() => {
        if (statusDiv.textContent === message) {
          statusDiv.textContent = "";
        }
      }, clearAfterMs);
    }
  }

  function renderSession(result) {
    const isSignedIn = Boolean(result.puterAuthToken);

    if (isSignedIn) {
      const username =
        result.puterUser?.username ||
        result.puterUser?.email ||
        "Signed in to Puter";
      sessionInfo.textContent = username;
      openPuterAuthButton.textContent = "Manage Puter Sign-In";
      signOutPuterButton.disabled = false;
    } else {
      sessionInfo.textContent = "Not signed in";
      openPuterAuthButton.textContent = "Sign In With Puter";
      signOutPuterButton.disabled = true;
    }
  }

  function loadPopupState() {
    chrome.storage.sync.get(
      ["puterAuthToken", "puterUser", "showAnswers", "processOnSwitch"],
      (result) => {
        renderSession(result);
        showAnswersToggle.checked =
          typeof result.showAnswers === "boolean" ? result.showAnswers : true;
        processOnSwitchToggle.checked =
          typeof result.processOnSwitch === "boolean"
            ? result.processOnSwitch
            : true;
      },
    );
  }

  showAnswersToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ showAnswers: showAnswersToggle.checked });
  });

  processOnSwitchToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ processOnSwitch: processOnSwitchToggle.checked });
  });

  openPuterAuthButton.addEventListener("click", () => {
    const authPageUrl = chrome.runtime.getURL("auth.html");
    chrome.tabs.create({ url: authPageUrl }, () => {
      if (chrome.runtime.lastError) {
        setStatus(
          `Could not open Puter sign-in page: ${chrome.runtime.lastError.message}`,
          4000,
        );
        return;
      }

      setStatus("Opened Puter sign-in page in a new tab.", 3000);
      window.close();
    });
  });

  signOutPuterButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "clearPuterSession" }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message, 4000);
        return;
      }

      if (!response?.success) {
        setStatus(response?.error || "Failed to clear Puter session.", 4000);
        return;
      }

      chrome.storage.sync.remove(["puterUser"], () => {
        renderSession({});
        setStatus("Signed out from Puter for this extension.", 3000);
      });
    });
  });

  processPageButton.addEventListener("click", () => {
    chrome.storage.sync.get(["puterAuthToken"], (session) => {
      if (!session.puterAuthToken) {
        setStatus("Sign in with Puter first.", 3000);
        return;
      }

      setStatus("Sending command to page...");
      chrome.runtime.sendMessage(
        {
          action: "processPageOnActiveTab",
          showAnswers: showAnswersToggle.checked,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Popup Error: Error sending message to background:",
              chrome.runtime.lastError.message,
            );
            setStatus(
              `Error: ${chrome.runtime.lastError.message}`,
              5000,
            );
            return;
          }

          if (!response) {
            setStatus(
              "No response from extension background. Try again once.",
              4000,
            );
            return;
          }

          if (response.success && response.result === true) {
            setStatus("Processing started on page.", 3000);
            return;
          }

          if (response.success && response.result === false) {
            setStatus(
              "No questions found, or answer display is disabled.",
              4000,
            );
            return;
          }

          setStatus(
            response.error
              ? `Error on page: ${response.error}`
              : "The page responded with an unexpected result.",
            5000,
          );
        },
      );
    });
  });

  loadPopupState();
});
