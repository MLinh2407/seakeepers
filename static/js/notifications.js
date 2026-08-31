function escapeHtmlNotif(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function refreshUnreadCount() {
  const badge = document.getElementById("notif-badge");
  if (!badge) return;

  const res = await fetch("/api/notifications/unread-count", { credentials: "same-origin" });
  const data = await res.json();

  if (data.count > 0) {
    badge.textContent = data.count;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}

async function toggleNotifDropdown() {
  const dropdown = document.getElementById("notif-dropdown");
  if (!dropdown) return;

  const isOpen = dropdown.style.display === "block";
  if (isOpen) {
    dropdown.style.display = "none";
    return;
  }

  const res = await fetch("/api/notifications", { credentials: "same-origin" });
  if (res.status === 401) {
    dropdown.innerHTML = "<p class='notif-empty'>Log in to see notifications.</p>";
    dropdown.style.display = "block";
    return;
  }

  const notifications = await res.json();
  if (notifications.length === 0) {
    dropdown.innerHTML = "<p class='notif-empty'>No notifications yet.</p>";
  } else {
    dropdown.innerHTML = notifications.map((n) => `
      <a class="notif-item ${n.read ? "" : "notif-unread"}" href="${n.link || "#"}">
        ${escapeHtmlNotif(n.message)}
      </a>
    `).join("");
  }
  dropdown.style.display = "block";

  // Mark everything read once the dropdown's actually been opened and seen
  await fetch("/api/notifications/read-all", { method: "POST", credentials: "same-origin" });
  refreshUnreadCount();
}

document.addEventListener("DOMContentLoaded", () => {
  const bell = document.getElementById("notif-bell");
  if (bell) {
    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNotifDropdown();
    });
  }

  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("notif-dropdown");
    if (dropdown && !e.target.closest("#notif-wrap")) {
      dropdown.style.display = "none";
    }
  });

  refreshUnreadCount();
});