const severityChartColors = [
  "#2ecc71", "#f39c12", "#e74c3c", "#3498db", "#9b59b6",
  "#1abc9c", "#e67e22", "#34495e", "#f1c40f", "#95a5a6",
];

async function loadByRegion() {
  const res = await fetch("/api/analytics/by-region");
  const { data, cached } = await res.json();

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
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    },
  });

  return cached;
}

async function loadByType() {
  const res = await fetch("/api/analytics/by-type");
  const { data, cached } = await res.json();

  new Chart(document.getElementById("type-chart"), {
    type: "pie",
    data: {
      labels: data.map((d) => d.category),
      datasets: [{
        data: data.map((d) => d.count),
        backgroundColor: severityChartColors,
      }],
    },
  });

  return cached;
}

async function loadTrends() {
  const res = await fetch("/api/analytics/trends");
  const { data, cached } = await res.json();

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
      scales: { y: { beginAtZero: true } },
    },
  });

  return cached;
}

document.addEventListener("DOMContentLoaded", async () => {
  const results = await Promise.all([loadByRegion(), loadByType(), loadTrends()]);
  const anyCached = results.some(Boolean);

  const status = document.createElement("p");
  status.id = "cache-status";
  status.textContent = anyCached
    ? "Some charts loaded from cache (refresh again within 5 min to see this) — Redis caching is working."
    : "Freshly computed from Athena + DynamoDB — first load or cache expired.";
  document.querySelector("main").before(status);
});