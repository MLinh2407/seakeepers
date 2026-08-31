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

function renderReports(reports) {
  const container = document.getElementById("my-reports-list");
  if (reports.length === 0) {
    container.innerHTML = "<p>You haven't submitted any reports yet.</p>";
    return;
  }
  container.innerHTML = reports.map((r) => `
    <div class="profile-card">
      <strong>${escapeHtml(r.category)}</strong> — ${escapeHtml(r.severity)} severity
      <p class="profile-card-meta">${r.site_name ? escapeHtml(r.site_name) + " · " : ""}${formatDate(r.timestamp)}</p>
    </div>
  `).join("");
}

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

async function loadProfile() {
  const res = await fetch("/api/profile", { credentials: "same-origin" });

  if (res.status === 401) {
    document.getElementById("profile-login-notice").textContent = "Log in to see your page.";
    document.getElementById("profile-login-notice").style.display = "block";
    document.getElementById("profile-content").style.display = "none";
    return;
  }

  const data = await res.json();
  document.getElementById("profile-login-notice").style.display = "none";
  document.getElementById("profile-content").style.display = "block";

  renderReports(data.my_reports);
  renderCampaignList("my-campaigns-list", data.my_campaigns, "You haven't organized any campaigns yet.");
  renderCampaignList("my-rsvps-list", data.rsvped_campaigns, "You haven't RSVP'd to any campaigns yet.");
}

document.addEventListener("DOMContentLoaded", loadProfile);