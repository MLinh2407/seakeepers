function escapeHtmlNotif(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Fetches and updates unread badge count
async function refreshUnreadCount() {
  const badge = document.getElementById("notif-badge");
  if (!badge) return;

  try {
    const res = await fetch("/api/notifications/unread-count", { credentials: "same-origin" });
    if (!res.ok) throw new Error("Notification count unavailable");
    const data = await res.json();

    if (data.count > 0) {
      badge.textContent = data.count > 99 ? "99+" : data.count;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  } catch {
    badge.style.display = "none";
  }
}

async function markAllNotificationsRead() {
  await fetch("/api/notifications/read-all", { method: "POST", credentials: "same-origin" });
  refreshUnreadCount();
}

// --- Dropdown Management ---

async function toggleNotifDropdown() {
  const bell = document.getElementById("notif-bell");
  const dropdown = document.getElementById("notif-dropdown");
  if (!dropdown) return;

  const isOpen = dropdown.style.display === "block";
  if (isOpen) {
    dropdown.style.display = "none";
    bell?.setAttribute("aria-expanded", "false");
    return;
  }

  dropdown.innerHTML = "<p class='notif-empty'>Loading notifications...</p>";
  dropdown.style.display = "block";
  bell?.setAttribute("aria-expanded", "true");

  try {
    const res = await fetch("/api/notifications", { credentials: "same-origin" });
    if (res.status === 401) {
      dropdown.innerHTML = "<p class='notif-empty'>Log in to see notifications.</p>";
      return;
    }
    if (!res.ok) throw new Error("Notifications unavailable");

    const notifications = await res.json();
    dropdown.innerHTML = "";

    if (notifications.length === 0) {
      dropdown.innerHTML = "<p class='notif-empty'>No notifications yet.</p>";
    } else {
      notifications.forEach((n) => {
        const item = document.createElement("a");
        item.href = n.link || "#";
        item.className = `notif-item ${n.read ? "" : "notif-unread"}`;
        item.textContent = n.message;

        if (n.link) {
          item.addEventListener("click", async (e) => {
            e.preventDefault();
            await markAllNotificationsRead();
            window.location.href = n.link;
          });
        }

        dropdown.appendChild(item);
      });
    }

    await markAllNotificationsRead();
  } catch {
    dropdown.innerHTML = "<p class='notif-empty notif-error'>Notifications are temporarily unavailable.</p>";
  }
}

// --- Event Handlers & Initialization ---

document.addEventListener("DOMContentLoaded", () => {
  const bell = document.getElementById("notif-bell");
  if (bell) {
    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNotifDropdown();
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("notif-dropdown");
    if (dropdown && !e.target.closest("#notif-wrap")) {
      dropdown.style.display = "none";
      document.getElementById("notif-bell")?.setAttribute("aria-expanded", "false");
    }
  });

  // Close dropdown on Escape key press
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.getElementById("notif-dropdown")?.style.setProperty("display", "none");
      document.getElementById("notif-bell")?.setAttribute("aria-expanded", "false");
    }
  });

  refreshUnreadCount();
});