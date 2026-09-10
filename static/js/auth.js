let sharedCurrentUser = null;

function sharedAuthMessage(message) {
  const element = document.getElementById("auth-message");
  if (element) element.textContent = message || "";
}

// Update UI elements visibility and labels based on auth state
function updateSharedAuthUI() {
  const loggedOut = document.getElementById("logged-out-panel");
  const loggedIn = document.getElementById("logged-in-panel");
  const label = document.getElementById("account-label");
  const avatar = document.querySelector(".account-avatar");
  if (!loggedOut || !loggedIn) return;

  document.body.classList.toggle("logged-out", !sharedCurrentUser);
  document.querySelectorAll("[data-auth-required], #notif-wrap, #auth-panel, a[href='/profile']").forEach((element) => {
    element.hidden = !sharedCurrentUser;
  });

  loggedOut.style.display = sharedCurrentUser ? "none" : "block";
  loggedIn.style.display = sharedCurrentUser ? "block" : "none";
  if (sharedCurrentUser) {
    const initial = sharedCurrentUser.trim().charAt(0).toUpperCase() || "?";
    document.getElementById("current-username").textContent = sharedCurrentUser;
    if (label) label.textContent = sharedCurrentUser;
    if (avatar) avatar.textContent = initial;
  } else {
    if (label) label.textContent = "Account";
    if (avatar) avatar.textContent = "?";
  }
}

// --- Auth Actions ---

async function sharedRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("reg-email").value,
        username: document.getElementById("reg-username").value,
        password: document.getElementById("reg-password").value,
      }),
    });
    const data = await res.json();
    sharedAuthMessage(data.message || data.error);
    if (res.ok) form.reset();
  } catch {
    sharedAuthMessage("We couldn't create your account. Please try again.");
  } finally {
    button.disabled = false;
  }
}

async function sharedLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email: document.getElementById("login-email").value,
        password: document.getElementById("login-password").value,
      }),
    });
    const data = await res.json();
    sharedAuthMessage(data.message || data.error);
    if (res.ok) {
      sharedCurrentUser = data.username;
      updateSharedAuthUI();
    }
  } catch {
    sharedAuthMessage("We couldn't sign you in. Please try again.");
  } finally {
    button.disabled = false;
  }
}

async function sharedLogout() {
  await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  sharedCurrentUser = null;
  window.location.replace("/");
}

// Fetch session status and redirect if unauthenticated on protected routes
async function checkSharedSession() {
  try {
    const res = await fetch("/api/session", { credentials: "same-origin" });
    const data = await res.json();
    sharedCurrentUser = data.logged_in ? data.username : null;
    updateSharedAuthUI();
    if (!sharedCurrentUser && window.location.pathname === "/profile") {
      window.location.replace("/");
    }
  } catch {
    sharedAuthMessage("Account status is temporarily unavailable.");
  }
}

// --- Event Handlers & Initializers ---
document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.getElementById("account-trigger");
  const panel = document.getElementById("account-popover");
  if (!trigger || !panel) return;

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = panel.classList.toggle("is-open");
    trigger.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#auth-panel")) {
      panel.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      panel.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }
  });

  document.getElementById("login-form")?.addEventListener("submit", sharedLogin);
  document.getElementById("register-form")?.addEventListener("submit", sharedRegister);
  document.getElementById("logout-btn")?.addEventListener("click", sharedLogout);
  updateSharedAuthUI();
  checkSharedSession();
});
