document.addEventListener("DOMContentLoaded", () => {
  const signInButton = document.getElementById("signInButton");
  const closeButton = document.getElementById("closeButton");
  const statusDiv = document.getElementById("status");
  const accountBox = document.getElementById("accountBox");

  function setStatus(message) {
    statusDiv.textContent = message;
  }

  function renderUser(user) {
    if (!user) {
      accountBox.style.display = "none";
      accountBox.textContent = "";
      return;
    }

    accountBox.style.display = "block";
    accountBox.textContent = `Signed in as ${user.username || user.email || "your Puter account"}. You can close this tab and use the extension popup now.`;
  }

  async function loadStoredSession() {
    const session = await chrome.storage.sync.get(["puterAuthToken", "puterAppId", "puterUser"]);
    if (session.puterAuthToken) {
      puter.setAuthToken(session.puterAuthToken);
      if (session.puterAppId) {
        puter.setAppID(session.puterAppId);
      }
      renderUser(session.puterUser || null);
      setStatus("Existing Puter session found.");
    }
  }

  signInButton.addEventListener("click", async () => {
    signInButton.disabled = true;
    setStatus("Opening Puter sign-in window...");

    try {
      const signInResult = await puter.auth.signIn();
      const user = await puter.auth.getUser();

      await chrome.storage.sync.set({
        puterAuthToken: signInResult.token,
        puterAppId: signInResult.app_uid || null,
        puterUser: user,
      });

      renderUser(user);
      setStatus("Puter sign-in completed successfully.");
    } catch (error) {
      console.error("Auth page: Puter sign-in failed.", error);
      const message =
        error?.msg ||
        error?.message ||
        (typeof error === "string" ? error : "Puter sign-in failed.");
      setStatus(message);
    } finally {
      signInButton.disabled = false;
    }
  });

  closeButton.addEventListener("click", () => {
    window.close();
  });

  loadStoredSession().catch((error) => {
    console.error("Auth page: Failed to load stored Puter session.", error);
    setStatus("Could not load saved Puter session.");
  });
});
