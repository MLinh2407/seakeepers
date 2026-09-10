// Shared logic for campaign list, creation, and detail pages.

let selectedLocation = null; // {display_name, lat, lon} -- set only via a picked suggestion

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

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

function cleanLocationQuery(text) {
  return text.replace(/\([^)]*\)/g, "").trim();
}

// --- Location Autocomplete ---

async function fetchLocationSuggestions(query) {
  const list = document.getElementById("campaign-location-suggestions");
  if (!list) return;

  const cleaned = cleanLocationQuery(query);
  if (cleaned.length < 3) {
    list.innerHTML = "";
    return;
  }

  const res = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(cleaned)}`);
  const suggestions = await res.json();
  list.innerHTML = "";
  suggestions.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.display_name;
    li.addEventListener("click", () => {
      selectedLocation = s;
      document.getElementById("campaign-location").value = s.display_name;
      list.innerHTML = "";
    });
    list.appendChild(li);
  });
}

const debouncedFetchLocationSuggestions = debounce(fetchLocationSuggestions, 350);

// --- Popular Sites ---

async function loadPopularSites() {
  const container = document.getElementById("popular-sites");
  if (!container) return;
  try {
    const res = await fetch("/api/analytics/by-region");
    const { data } = await res.json();
    container.innerHTML = "";
    data.slice(0, 5).forEach((d) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-btn";
      btn.textContent = `${d.site_name} (${d.count} reports)`;
      btn.addEventListener("click", () => {
        const cleaned = cleanLocationQuery(d.site_name);
        document.getElementById("campaign-location").value = cleaned;
        fetchLocationSuggestions(cleaned);
      });
      container.appendChild(btn);
    });
  } catch {
    // Fail silently if analytics data is unavailable
  }
}

// --- Create Campaign ---

async function submitCampaign(e) {
  e.preventDefault();
  const message = document.getElementById("campaign-message");
  const form = document.getElementById("campaign-form");
  const submitButton = form.querySelector("button[type='submit']");

  if (!selectedLocation) {
    message.textContent = "Search for a location and pick a suggestion first.";
    return;
  }

  const date = document.getElementById("campaign-date").value;
  const description = document.getElementById("campaign-description").value.trim();

  if (!date || !description) {
    message.textContent = "Date and description are required.";
    return;
  }

  const formData = new FormData();
  formData.append("location_name", selectedLocation.display_name);
  formData.append("lat", selectedLocation.lat);
  formData.append("lon", selectedLocation.lon);
  formData.append("date", date);
  formData.append("description", description);

  const photoInput = document.getElementById("campaign-photo");
  if (photoInput && photoInput.files[0]) {
    formData.append("photo", photoInput.files[0]);
  }

  submitButton.disabled = true;
  submitButton.textContent = "Creating...";
  message.textContent = "Saving your cleanup campaign...";
  try {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    });
    const data = await res.json();
    message.textContent = data.message || data.error;

    if (res.ok) {
      form.reset();
      selectedLocation = null;
      loadCampaignsList();
    }
  } catch {
    message.textContent = "We couldn't create the campaign. Check your connection and try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Create campaign";
  }
}

// --- Share Helpers ---

const ICON_SHARE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"/><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"/></svg>`;
const ICON_EMAIL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>`;
const ICON_CALENDAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>`;

function avatarInitial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function buildShareText(locationName, description, date, shareUrl) {
  return `Join a beach cleanup at ${locationName}\n\n${description}\n\nWhen: ${date}\nDetails: ${shareUrl}`;
}

function buildGmailComposeUrl(subject, body) {
  return `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildFacebookShareUrl(shareUrl, locationName, description) {
  const quote = `${description} (cleanup at ${locationName})`;
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(quote)}`;
}

// --- List campaigns ---

async function loadCampaignsList() {
  const list = document.getElementById("campaigns-list");
  if (!list) return;

  list.innerHTML = '<p class="list-status">Loading cleanup campaigns...</p>';
  try {
    const res = await fetch("/api/campaigns", { credentials: "same-origin" });
    const campaigns = await res.json();
    if (!res.ok || !Array.isArray(campaigns)) throw new Error("Campaigns unavailable");

    list.innerHTML = "";
    if (campaigns.length === 0) {
      list.innerHTML = "<p class='list-status'>No campaigns yet. Be the first to organize one.</p>";
      return;
    }

    campaigns.forEach((c) => {
    const locationName = c.location_name || "Unknown location";
    const organizerName = c.organizer_username || "Someone";
    const card = document.createElement("div");
    card.className = "campaign-card";

    const shareUrl = `${window.location.origin}/campaigns/${c.campaign_id}`;
    const fbUrl = buildFacebookShareUrl(shareUrl, locationName, c.description);
    const shareText = buildShareText(locationName, c.description, c.date, shareUrl);
    const gmailUrl = buildGmailComposeUrl(`Join a beach cleanup at ${locationName}`, shareText);

    card.innerHTML = `
      <div class="campaign-card-header">
        <div class="campaign-avatar">${escapeHtml(avatarInitial(organizerName))}</div>
        <div class="campaign-header-text">
          <span class="campaign-organizer">${escapeHtml(organizerName)}</span>
          <span class="campaign-posted">Posted ${formatDate(c.created_at)}</span>
        </div>
      </div>
      ${c.photo_url ? `<img src="${c.photo_url}" class="campaign-card-photo" onerror="this.style.display='none'" />` : ""}
      <div class="campaign-card-body">
        <h3 class="campaign-location">${escapeHtml(locationName)}</h3>
        <span class="campaign-date-badge">Cleanup: ${formatDate(c.date)}</span>
        <p class="campaign-description">${escapeHtml(c.description)}</p>
        <p class="rsvp-count">${c.rsvp_count ?? 0} going</p>
      </div>
      <div class="campaign-card-actions">
        <button class="icon-btn rsvp-btn ${c.user_has_rsvped ? "rsvp-going" : ""}" data-id="${c.campaign_id}" data-rsvped="${c.user_has_rsvped}">
          ${ICON_CALENDAR}<span>${c.user_has_rsvped ? "Going" : "RSVP"}</span>
        </button>
        <a class="icon-btn" href="${fbUrl}" target="_blank" rel="noopener">${ICON_SHARE}<span>Facebook</span></a>
        <a class="icon-btn" href="${gmailUrl}" target="_blank" rel="noopener">${ICON_EMAIL}<span>Email</span></a>
      </div>
    `;

    card.querySelector(".rsvp-btn").addEventListener("click", (e) => toggleRsvp(e.target.closest(".rsvp-btn"), c.campaign_id));
      list.appendChild(card);
    });
  } catch {
    list.innerHTML = '<p class="list-status list-error">Campaigns are temporarily unavailable. Refresh and try again.</p>';
  }
}

async function toggleRsvp(button, campaignId) {
  const isRsvped = button.dataset.rsvped === "true";
  const method = isRsvped ? "DELETE" : "POST";

  const res = await fetch(`/api/campaigns/${campaignId}/rsvp`, {
    method,
    credentials: "same-origin",
  });

  if (res.status === 401) {
    alert("Log in to RSVP.");
    return;
  }
  if (res.ok) {
    loadCampaignsList();
  }
}

// --- Detail Page ---

async function setupDetailPage() {
  const btn = document.getElementById("rsvp-btn");
  if (!btn) return;

  const status = document.getElementById("campaign-detail-status");
  const campaignId = btn.dataset.campaignId;
  const setStatus = (message, isError = false) => {
    if (!status) return;
    status.className = `campaign-detail-status${isError ? " is-error" : ""}`;
    status.innerHTML = isError
      ? `${escapeHtml(message)} <button type="button" class="status-retry">Try again</button>`
      : `<span class="status-spinner" aria-hidden="true"></span>${escapeHtml(message)}`;
    const retry = status.querySelector(".status-retry");
    if (retry) retry.addEventListener("click", setupDetailPage, { once: true });
  };

  btn.disabled = true;
  setStatus("Loading campaign details...");

  try {
    const res = await fetch(`/api/campaigns/${campaignId}`, { credentials: "same-origin" });
    const c = await res.json();
    if (!res.ok || !c || c.error) {
      throw new Error(c?.error || "We couldn't load this campaign.");
    }

    const organizerName = c.organizer_username || "Someone";
    document.getElementById("campaign-avatar").textContent = avatarInitial(organizerName);
    document.getElementById("campaign-organizer").textContent = organizerName;
    document.getElementById("campaign-date-line").textContent = `Cleanup: ${formatDate(c.date)}`;
    document.getElementById("campaign-posted-line").textContent = `Posted ${formatDate(c.created_at)}`;

    btn.dataset.rsvped = c.user_has_rsvped;
    btn.classList.toggle("rsvp-going", c.user_has_rsvped);
    btn.innerHTML = `${ICON_CALENDAR}<span>${c.user_has_rsvped ? "Going" : "RSVP"}</span>`;
    btn.disabled = false;
    document.getElementById("rsvp-status").textContent = `${c.rsvp_count ?? 0} going`;
    if (status) {
      status.className = "campaign-detail-status is-ready";
      status.textContent = "Campaign details loaded";
    }

    btn.onclick = async () => {
      const isRsvped = btn.dataset.rsvped === "true";
      const method = isRsvped ? "DELETE" : "POST";
      btn.disabled = true;
      const rsvpRes = await fetch(`/api/campaigns/${campaignId}/rsvp`, { method, credentials: "same-origin" });

      if (rsvpRes.status === 401) {
        alert("Log in to RSVP.");
        btn.disabled = false;
        return;
      }
      if (rsvpRes.ok) {
        setupDetailPage();
      } else {
        btn.disabled = false;
        setStatus("We couldn't update your RSVP. Please try again.", true);
      }
    };

    const shareUrl = window.location.href;
    const shareText = buildShareText(c.location_name, c.description, c.date, shareUrl);

    const fbLink = document.getElementById("fb-share");
    if (fbLink) {
      fbLink.href = buildFacebookShareUrl(shareUrl, c.location_name, c.description);
      fbLink.innerHTML = `${ICON_SHARE}<span>Facebook</span>`;
      fbLink.classList.remove("is-disabled");
      fbLink.removeAttribute("aria-disabled");
    }

    const gmailLink = document.getElementById("gmail-share");
    if (gmailLink) {
      gmailLink.href = buildGmailComposeUrl(`Join a beach cleanup at ${c.location_name}`, shareText);
      gmailLink.innerHTML = `${ICON_EMAIL}<span>Email</span>`;
      gmailLink.classList.remove("is-disabled");
      gmailLink.removeAttribute("aria-disabled");
    }
  } catch (error) {
    btn.disabled = true;
    setStatus(error.message || "We couldn't load this campaign.", true);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const dateInput = document.getElementById("campaign-date");
  if (dateInput) {
    dateInput.min = new Date().toISOString().split("T")[0];
  }

  const locationInput = document.getElementById("campaign-location");
  if (locationInput) {
    locationInput.addEventListener("input", (e) => {
      selectedLocation = null;
      debouncedFetchLocationSuggestions(e.target.value.trim());
    });
  }

  const form = document.getElementById("campaign-form");
  if (form) form.addEventListener("submit", submitCampaign);

  loadCampaignsList();
  loadPopularSites();
  setupDetailPage();

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".location-input-wrap")) {
      const list = document.getElementById("campaign-location-suggestions");
      if (list) list.innerHTML = "";
    }
  });
});