let map;
let currentUser = null;
let pendingMarker = null;

let allReports = [];
let allCampaigns = [];
let markers = [];
let campaignMarkers = [];

const severityColors = {
  low: "#2ecc71",
  medium: "#f39c12",
  high: "#e74c3c",
};

function initMap() {
  // OpenStreetMap raster tiles
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        "osm-tiles": {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
        },
      },
      layers: [{ id: "osm-tiles", type: "raster", source: "osm-tiles", minzoom: 0, maxzoom: 19 }],
    },
    center: [0, 20],
    zoom: 2,
  });
  map.addControl(new maplibregl.NavigationControl());

  map.on("load", () => {
    loadReports();
    loadCampaignMarkers();
  });

  // Click-to-pin: Reverse geocodes clicked point and sets a pending pin
  map.on("click", async (e) => {
    // Ignore clicks on existing markers
    const target = e.originalEvent.target;
    if (target.closest(".debris-marker, .campaign-marker, .pending-pin")) {
      return;
    }

    const lat = e.lngLat.lat;
    const lon = e.lngLat.lng;
    setPendingLocation(lat, lon, "Looking up this location...");

    const name = await reverseGeocode(lat, lon);
    document.getElementById("address").value = name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    document.getElementById("site_name").value = name || "";
    document.getElementById("pin-status").textContent = name
      ? `Pin set: ${name}`
      : `Pin set: ${lat.toFixed(4)}, ${lon.toFixed(4)} (no place name found)`;
  });
}

// --- Filters ---

function currentFilters() {
  const severities = Array.from(document.querySelectorAll(".filter-severity:checked")).map((el) => el.value);
  return {
    showReports: document.getElementById("filter-show-reports").checked,
    showCampaigns: document.getElementById("filter-show-campaigns").checked,
    severities,
    category: document.getElementById("filter-category").value,
  };
}

function applyFilters() {
  renderReportMarkers();
  renderCampaignMarkers();
}

// --- Campaigns ---

async function loadCampaignMarkers() {
  const res = await fetch("/api/campaigns");
  allCampaigns = await res.json();
  renderCampaignMarkers();
}

function renderCampaignMarkers() {
  const { showCampaigns } = currentFilters();

  campaignMarkers.forEach((m) => m.remove());
  campaignMarkers = [];

  if (!showCampaigns) {
    updateFilterCount();
    return;
  }

  allCampaigns.forEach((c) => {
    if (c.lat == null || c.lon == null) return; // older/malformed campaigns without a resolved location

    const el = document.createElement("div");
    el.className = "campaign-marker";
    el.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C7.6 0 4 3.6 4 8c0 5.4 8 16 8 16s8-10.6 8-16c0-4.4-3.6-8-8-8z" fill="#9b59b6"/>
        <circle cx="12" cy="8" r="3" fill="white"/>
      </svg>
    `;

    const popupHtml = `
      <strong>${escapeHtml(c.location_name || "Cleanup event")}</strong><br/>
      ${c.date ? escapeHtml(c.date) + "<br/>" : ""}
      ${c.description ? escapeHtml(c.description) + "<br/>" : ""}
      ${c.rsvp_count ?? 0} going<br/>
      <a href="/campaigns/${c.campaign_id}" target="_blank" rel="noopener">View and RSVP</a>
    `;

    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([c.lon, c.lat])
      .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(popupHtml))
      .addTo(map);

    campaignMarkers.push(marker);
  });

  updateFilterCount();
}

// --- Reports ---

async function loadReports() {
  const res = await fetch("/api/reports");
  allReports = await res.json();
  renderReportMarkers();
}

function renderReportMarkers() {
  const { showReports, severities, category } = currentFilters();

  markers.forEach((m) => m.remove());
  markers = [];

  if (!showReports) {
    updateFilterCount();
    return;
  }

  const filtered = allReports.filter((r) => {
    if (r.lat == null || r.lon == null) return false;
    if (!severities.includes(r.severity)) return false;
    if (category !== "all" && r.category !== category) return false;
    return true;
  });

  filtered.forEach((r) => {
    const el = document.createElement("div");
    el.className = "debris-marker";
    el.style.backgroundColor = severityColors[r.severity] || "#999";

    const popupHtml = `
      <strong>${escapeHtml(r.category)}</strong><br/>
      Severity: ${escapeHtml(r.severity)}<br/>
      ${r.site_name ? escapeHtml(r.site_name) + "<br/>" : "<em>No location name recorded</em><br/>"}
      ${r.weather_snapshot ? "Weather: " + escapeHtml(r.weather_snapshot) + "<br/>" : ""}
      ${r.photo_url ? `<img src="${r.photo_url}" style="max-width:150px;margin-top:4px;" onerror="this.style.display='none'" />` : ""}
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([r.lon, r.lat])
      .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(popupHtml))
      .addTo(map);

    markers.push(marker);
  });

  updateFilterCount();
}

function updateFilterCount() {
  const countEl = document.getElementById("filter-count");
  if (!countEl) return;
  countEl.textContent = `Showing ${markers.length} report${markers.length === 1 ? "" : "s"}, ${campaignMarkers.length} campaign${campaignMarkers.length === 1 ? "" : "s"}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// --- Pending pin ---

function pendingPinElement() {
  const el = document.createElement("div");
  el.className = "pending-pin";
  el.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C7.6 0 4 3.6 4 8c0 5.4 8 16 8 16s8-10.6 8-16c0-4.4-3.6-8-8-8z" fill="#1a73e8"/>
      <circle cx="12" cy="8" r="3" fill="white"/>
    </svg>
  `;
  return el;
}

function setPendingLocation(lat, lon, statusText) {
  document.getElementById("lat").value = lat;
  document.getElementById("lon").value = lon;
  if (statusText) {
    document.getElementById("pin-status").textContent = statusText;
  }

  if (pendingMarker) {
    pendingMarker.setLngLat([lon, lat]);
  } else {
    pendingMarker = new maplibregl.Marker({ element: pendingPinElement(), anchor: "bottom" })
      .setLngLat([lon, lat])
      .addTo(map);
  }

  map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 9) });
}

function clearPendingLocation() {
  document.getElementById("lat").value = "";
  document.getElementById("lon").value = "";
  document.getElementById("site_name").value = "";
  document.getElementById("pin-status").textContent = "";
  if (pendingMarker) {
    pendingMarker.remove();
    pendingMarker = null;
  }
}

// --- Geocoding (proxied via backend for Nominatim headers) ---

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function fetchSuggestions(query) {
  const list = document.getElementById("address-suggestions");
  if (query.length < 3) {
    list.innerHTML = "";
    return;
  }

  const res = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(query)}`);
  const suggestions = await res.json();

  list.innerHTML = "";
  suggestions.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.display_name;
    li.addEventListener("click", () => selectSuggestion(s));
    list.appendChild(li);
  });
}

const debouncedFetchSuggestions = debounce(fetchSuggestions, 350);

function selectSuggestion(s) {
  document.getElementById("address").value = s.display_name;
  document.getElementById("site_name").value = s.display_name;
  document.getElementById("address-suggestions").innerHTML = "";
  setPendingLocation(s.lat, s.lon, `Pin set: ${s.display_name}`);
}

async function reverseGeocode(lat, lon) {
  const res = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lon}`);
  const data = await res.json();
  return data.display_name || null;
}

async function useCurrentLocation() {
  const status = document.getElementById("pin-status");

  if (!navigator.geolocation) {
    status.textContent = "Your browser doesn't support geolocation.";
    return;
  }

  // Geolocation requires HTTPS or localhost
  if (!window.isSecureContext) {
    status.textContent =
      "Current-location requires a secure (HTTPS) connection, which this deployment doesn't have. Search for an address or click the map instead.";
    return;
  }

  status.textContent = "Getting your location...";

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      setPendingLocation(lat, lon, "Looking up this location...");

      const name = await reverseGeocode(lat, lon);
      document.getElementById("address").value = name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      document.getElementById("site_name").value = name || "";
      status.textContent = name
        ? `Pin set: ${name}`
        : `Pin set: ${lat.toFixed(4)}, ${lon.toFixed(4)} (no place name found)`;
    },
    () => {
      status.textContent = "Couldn't get your location -- check browser permissions.";
    }
  );
}

// --- Map search (navigational only) ---

async function fetchMapSearchSuggestions(query) {
  const list = document.getElementById("map-search-suggestions");
  if (query.length < 3) {
    list.innerHTML = "";
    return;
  }

  const res = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(query)}`);
  const suggestions = await res.json();

  list.innerHTML = "";
  suggestions.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.display_name;
    li.addEventListener("click", () => {
      document.getElementById("map-search").value = s.display_name;
      list.innerHTML = "";
      map.flyTo({ center: [s.lon, s.lat], zoom: 12 });
    });
    list.appendChild(li);
  });
}

const debouncedFetchMapSearchSuggestions = debounce(fetchMapSearchSuggestions, 350);

// --- Auth ---

async function register(e) {
  e.preventDefault();
  const email = document.getElementById("reg-email").value;
  const username = document.getElementById("reg-username").value;
  const password = document.getElementById("reg-password").value;

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    });
    const data = await res.json();
    document.getElementById("report-auth-message").textContent = data.message || data.error;
    if (res.ok) {
      document.getElementById("register-form").reset();
    }
  } catch {
    document.getElementById("report-auth-message").textContent = "We couldn't create your account. Please try again.";
  }
}

async function login(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    document.getElementById("report-auth-message").textContent = data.message || data.error;
    if (res.ok) {
      currentUser = data.username;
      updateAuthUI();
    }
  } catch {
    document.getElementById("report-auth-message").textContent = "We couldn't sign you in. Please try again.";
  }
}

async function logout() {
  await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  currentUser = null;
  window.location.replace("/");
}

function updateAuthUI() {
  document.body.classList.toggle("logged-out", !currentUser);
  document.querySelectorAll("[data-auth-required], #notif-wrap, #auth-panel, a[href='/profile']").forEach((element) => {
    element.hidden = !currentUser;
  });
  document.getElementById("logged-in-panel").style.display = currentUser ? "block" : "none";
  const accountLabel = document.getElementById("account-label");
  const accountAvatar = document.querySelector(".account-avatar");
  if (currentUser) {
    document.getElementById("current-username").textContent = currentUser;
    if (accountLabel) accountLabel.textContent = currentUser;
    if (accountAvatar) accountAvatar.textContent = currentUser.trim().charAt(0).toUpperCase() || "?";
  } else {
    if (accountLabel) accountLabel.textContent = "Account";
    if (accountAvatar) accountAvatar.textContent = "?";
  }

  document.getElementById("report-form").style.display = currentUser ? "block" : "none";
  document.getElementById("report-login-notice").style.display = currentUser ? "none" : "block";
  document.getElementById("report-auth-panel").style.display = currentUser ? "none" : "block";
}

async function checkSession() {
  const res = await fetch("/api/session", { credentials: "same-origin" });
  const data = await res.json();
  currentUser = data.logged_in ? data.username : null;
  updateAuthUI();
}

// --- Report submission ---

async function submitReport(e) {
  e.preventDefault();

  const lat = document.getElementById("lat").value;
  const lon = document.getElementById("lon").value;

  if (!lat || !lon) {
    document.getElementById("report-message").textContent =
      "Pick a location first -- search and select a suggestion, use your current location, or click the map.";
    return;
  }

  const formData = new FormData();
  formData.append("category", document.getElementById("category").value);
  formData.append("severity", document.getElementById("severity").value);
  formData.append("lat", lat);
  formData.append("lon", lon);
  formData.append("site_name", document.getElementById("site_name").value);

  const photoInput = document.getElementById("photo");
  if (photoInput.files[0]) {
    formData.append("photo", photoInput.files[0]);
  }

  const res = await fetch("/api/reports", {
    method: "POST",
    credentials: "same-origin",
    body: formData,
  });
  const data = await res.json();
  document.getElementById("report-message").textContent = data.warning
    ? `${data.message} (${data.warning})`
    : (data.message || data.error);

  if (res.ok) {
    document.getElementById("report-form").reset();
    document.getElementById("address-suggestions").innerHTML = "";
    clearPendingLocation();
    loadReports();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  checkSession();

  document.getElementById("register-form").addEventListener("submit", register);
  document.getElementById("login-form").addEventListener("submit", login);
  document.getElementById("logout-btn").addEventListener("click", logout);
  const accountTrigger = document.getElementById("account-trigger");
  const accountPopover = document.getElementById("account-popover");
  accountTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = accountPopover.classList.toggle("is-open");
    accountTrigger.setAttribute("aria-expanded", String(isOpen));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#auth-panel")) {
      accountPopover.classList.remove("is-open");
      accountTrigger.setAttribute("aria-expanded", "false");
    }
  });
  document.getElementById("report-form").addEventListener("submit", submitReport);
  document.getElementById("use-location-btn").addEventListener("click", useCurrentLocation);

  const addressInput = document.getElementById("address");
  addressInput.addEventListener("input", (e) => {
    clearPendingLocation();
    debouncedFetchSuggestions(e.target.value.trim());
  });

  const mapSearchInput = document.getElementById("map-search");
  mapSearchInput.addEventListener("input", (e) => {
    debouncedFetchMapSearchSuggestions(e.target.value.trim());
  });

  document.getElementById("filter-show-reports").addEventListener("change", applyFilters);
  document.getElementById("filter-show-campaigns").addEventListener("change", applyFilters);
  document.getElementById("filter-category").addEventListener("change", renderReportMarkers);
  document.querySelectorAll(".filter-severity").forEach((el) => {
    el.addEventListener("change", renderReportMarkers);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".location-input-wrap")) {
      document.getElementById("address-suggestions").innerHTML = "";
    }
    if (!e.target.closest(".map-search-wrap")) {
      document.getElementById("map-search-suggestions").innerHTML = "";
    }
  });
});