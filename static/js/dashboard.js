// Color palette for chart categories
const severityChartColors = [
  "#2ecc71", "#f39c12", "#e74c3c", "#3498db", "#9b59b6",
  "#1abc9c", "#e67e22", "#34495e", "#f1c40f", "#95a5a6",
];

// Replaces a canvas with an error message paragraph if chart loading fails
function showChartError(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const notice = document.createElement("p");
  notice.className = "chart-error";
  notice.textContent = message;
  canvas.replaceWith(notice);
}

// --- Chart Loaders ---

async function loadByRegion() {
  try {
    const res = await fetch("/api/analytics/by-region");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data, cached, partial } = await res.json();

    new Chart(document.getElementById("region-chart"), {
      type: "bar",
      data: {
        labels: data.map((d) => d.site_name),
        datasets: [{
          label: "Reports",
          data: data.map((d) => d.count),
          backgroundColor: "#10403b",
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
      },
    });

    return { cached, partial };
  } catch (e) {
    showChartError("region-chart", "Couldn't load this chart right now -- please refresh in a moment.");
    return { cached: false, partial: true, failed: true };
  }
}

async function loadByType() {
  try {
    const res = await fetch("/api/analytics/by-type");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data, cached, partial } = await res.json();

    new Chart(document.getElementById("type-chart"), {
      type: "pie",
      data: {
        labels: data.map((d) => d.category),
        datasets: [{
          data: data.map((d) => d.count),
          backgroundColor: severityChartColors,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });

    return { cached, partial };
  } catch (e) {
    showChartError("type-chart", "Couldn't load this chart right now -- please refresh in a moment.");
    return { cached: false, partial: true, failed: true };
  }
}

async function loadTrends() {
  try {
    const res = await fetch("/api/analytics/trends");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data, cached, partial } = await res.json();

    new Chart(document.getElementById("trends-chart"), {
      type: "line",
      data: {
        labels: data.map((d) => d.month),
        datasets: [{
          label: "Reports per month",
          data: data.map((d) => d.count),
          borderColor: "#10403b",
          backgroundColor: "rgba(16, 64, 59, 0.1)",
          fill: true,
          tension: 0.2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            enabled: true,
            callbacks: {
              title: (items) => items[0]?.label || "",
              label: (context) => `${context.parsed.y} reports`,
            },
          },
        },
        scales: { y: { beginAtZero: true } },
      },
    });

    return { cached, partial };
  } catch (e) {
    showChartError("trends-chart", "Couldn't load this chart right now -- please refresh in a moment.");
    return { cached: false, partial: true, failed: true };
  }
}

// --- Initialization & Status Banner ---

document.addEventListener("DOMContentLoaded", async () => {
  const settled = await Promise.allSettled([loadByRegion(), loadByType(), loadTrends()]);
  const results = settled.map((s) => (s.status === "fulfilled" ? s.value : { failed: true }));

  const anyCached = results.some((r) => r.cached);
  const anyPartial = results.some((r) => r.partial);

  // Render analytics status banner based on cache/data completeness
  const status = document.createElement("p");
  status.id = "cache-status";
  if (anyPartial) {
    status.textContent = "Some data couldn't be loaded (Athena may be slow or unavailable right now) -- showing what's available.";
  } else if (anyCached) {
    status.textContent = "Some charts loaded from cache (refresh again within 5 min to see this). Redis caching is working.";
  } else {
    status.textContent = "Freshly computed from Athena and DynamoDB (first load or cache expired).";
  }
  document.querySelector("main").before(status);
});