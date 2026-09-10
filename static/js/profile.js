// --- Helpers & UI Renderers ---

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Renders reports submitted by the logged-in user
function renderReports(reports) {
  const container = document.getElementById("my-reports-list");
  if (reports.length === 0) {
    container.innerHTML = "<p>You haven't submitted any reports yet.</p>";
    return;
  }
  container.innerHTML = reports.map((r) => `
    <div class="profile-card">
      <strong>${escapeHtml(r.category)}</strong> · ${escapeHtml(r.severity)} severity
      <p class="profile-card-meta">${r.site_name ? escapeHtml(r.site_name) + " · " : ""}${formatDate(r.timestamp)}</p>
    </div>
  `).join("");
}

// Renders campaigns (organized or RSVP'd) into a target container
function renderCampaignList(containerId, campaigns, emptyText) {
  const container = document.getElementById(containerId);
  if (campaigns.length === 0) {
    container.innerHTML = `<p>${emptyText}</p>`;
    return;
  }
  container.innerHTML = campaigns.map((c) => `
    <div class="profile-card">
      <a href="/campaigns/${c.campaign_id}"><strong>${escapeHtml(c.location_name || "Unknown location")}</strong></a>
      <p class="profile-card-meta">Cleanup: ${formatDate(c.date)} · Posted ${formatDate(c.created_at)} · ${c.rsvp_count ?? 0} going</p>
    </div>
  `).join("");
}

// --- Tab Navigation ---

function setProfileTab(tabName) {
  document.querySelectorAll("[data-profile-tab]").forEach((element) => {
    const isSelected = element.dataset.profileTab === tabName;
    element.classList.toggle("is-active", isSelected);
    element.setAttribute("aria-selected", String(isSelected));
  });
  document.querySelectorAll("[role='tabpanel']").forEach((panel) => {
    panel.hidden = panel.id !== `profile-panel-${tabName}`;
  });
}

function setupProfileTabs() {
  document.querySelectorAll("[data-profile-tab]").forEach((element) => {
    element.addEventListener("click", () => setProfileTab(element.dataset.profileTab));
  });
}

// --- Data Loading & Initialization ---

// Fetches user profile data and updates counts and lists
async function loadProfile() {
  const notice = document.getElementById("profile-login-notice");
  try {
    const res = await fetch("/api/profile", { credentials: "same-origin" });

    if (res.status === 401) {
      notice.textContent = "Log in to see your page.";
      notice.style.display = "block";
      document.getElementById("profile-content").style.display = "none";
      return;
    }

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Couldn't load your page.");
    notice.style.display = "none";
    document.getElementById("profile-content").style.display = "block";

    renderReports(data.my_reports);
    renderCampaignList("my-campaigns-list", data.my_campaigns, "You haven't organized any campaigns yet.");
    renderCampaignList("my-rsvps-list", data.rsvped_campaigns, "You haven't RSVP'd to any campaigns yet.");
    document.getElementById("reports-count").textContent = data.my_reports.length;
    document.getElementById("organizing-count").textContent = data.my_campaigns.length;
    document.getElementById("attending-count").textContent = data.rsvped_campaigns.length;
  } catch (error) {
    notice.textContent = error.message || "We couldn't load your page. Please refresh and try again.";
    notice.style.display = "block";
    document.getElementById("profile-content").style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupProfileTabs();
  loadProfile();
});