let map;
let currentUser = null;
let pendingMarker = null;

const severityColors = {
  low: "#2ecc71",
  medium: "#f39c12",
  high: "#e74c3c",
};

function initMap() {
  // demotiles.maplibre.org is MapLibre's own free demo style -- no API key
  // or account needed, fine for MVP. Swap for a nicer basemap later if desired.
  map = new maplibregl.Map({
    container: "map",
    style: "https://demotiles.maplibre.org/style.json",
    center: [0, 20],
    zoom: 2,
  });
  map.addControl(new maplibregl.NavigationControl());

  map.on("load", () => {
    loadReports();
  });

  // Click-to-pin: resolves the clicked point to a place name via reverse
  // geocoding, and drops the visual pending-pin marker there.
  map.on("click", async (e) => {
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

let markers = [];

async function loadReports() {
  const res = await fetch("/api/reports");
  const reports = await res.json();

  markers.forEach((m) => m.remove());
  markers = [];

  reports.forEach((r) => {
    if (r.lat == null || r.lon == null) return;

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
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// --- Pending pin (shows exactly where the report-in-progress will land) ---

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

// --- Geocoding (all proxied through our backend -- Nominatim requires a
// custom User-Agent header that browsers won't let JS set directly) ---

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

// --- Auth ---

async function register(e) {
  e.preventDefault();
  const email = document.getElementById("reg-email").value;
  const username = document.getElementById("reg-username").value;
  const password = document.getElementById("reg-password").value;

  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  const data = await res.json();
  document.getElementById("auth-message").textContent = data.message || data.error;
  if (res.ok) {
    document.getElementById("register-form").reset();
  }
}

async function login(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  document.getElementById("auth-message").textContent = data.message || data.error;
  if (res.ok) {
    currentUser = data.username;
    updateAuthUI();
  }
}

async function logout() {
  await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  currentUser = null;
  updateAuthUI();
}

function updateAuthUI() {
  document.getElementById("logged-out-panel").style.display = currentUser ? "none" : "block";
  document.getElementById("logged-in-panel").style.display = currentUser ? "block" : "none";
  if (currentUser) {
    document.getElementById("current-username").textContent = currentUser;
  }

  // Gate the report form on real auth state -- previously this was always
  // visible regardless of login status, and currentUser also used to reset
  // to null on every page refresh even if the session cookie was still valid,
  // so this now checks the real server-side session instead of assuming.
  document.getElementById("report-form").style.display = currentUser ? "block" : "none";
  document.getElementById("report-login-notice").style.display = currentUser ? "none" : "block";
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
  document.getElementById("report-message").textContent = data.message || data.error;

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
  document.getElementById("report-form").addEventListener("submit", submitReport);
  document.getElementById("use-location-btn").addEventListener("click", useCurrentLocation);

  const addressInput = document.getElementById("address");
  addressInput.addEventListener("input", (e) => {
    // Typing invalidates any previously picked location -- programmatic
    // .value assignment (from selectSuggestion/reverseGeocode) does NOT
    // fire this event, so picking a suggestion won't immediately clear itself.
    clearPendingLocation();
    debouncedFetchSuggestions(e.target.value.trim());
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".location-input-wrap")) {
      document.getElementById("address-suggestions").innerHTML = "";
    }
  });
});