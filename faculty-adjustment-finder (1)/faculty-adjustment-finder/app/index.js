const DATA_URL = "../data/timetable_data.json";

let DATA = null;

const daySelect = document.getElementById("day-select");
const periodSelect = document.getElementById("period-select");
const deptFilter = document.getElementById("dept-filter");
const resultsList = document.getElementById("results-list");
const resultsTitle = document.getElementById("results-title");
const resultsCount = document.getElementById("results-count");
const visitCountEl = document.getElementById("visit-count");

init();
trackVisit();

async function init() {
  try {
    const res = await fetch(DATA_URL);
    DATA = await res.json();
  } catch (err) {
    resultsTitle.textContent = "Could not load timetable data";
    resultsList.innerHTML = `<div class="empty-state">Unable to load timetable data. Please try again later.</div>`;
    return;
  }

  populateDayAndPeriod();
  render();

  daySelect.addEventListener("change", render);
  periodSelect.addEventListener("change", render);
  deptFilter.addEventListener("input", render);
}

function populateDayAndPeriod() {
  const dayLabels = { Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday" };
  DATA.days.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = dayLabels[d] || d;
    daySelect.appendChild(opt);
  });

  DATA.periods.filter(p => !p.is_break).forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `Period ${p.label} (${p.time})`;
    periodSelect.appendChild(opt);
  });

  // Default to a sensible current-ish slot if possible, else first option.
  daySelect.value = DATA.days[0];
  periodSelect.value = DATA.periods.find(p => !p.is_break).id;
}

function findBusyEntry(fac, day, periodId) {
  return fac.busy.find(b =>
    b.day === day &&
    b.period_start <= periodId &&
    periodId <= b.period_end
  );
}

function render() {
  const day = daySelect.value;
  const periodId = Number(periodSelect.value);
  const keyword = deptFilter.value.trim().toLowerCase();

  const dayLabels = { Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday" };
  const periodMeta = DATA.periods.find(p => p.id === periodId);
  resultsTitle.textContent = `${dayLabels[day]}, Period ${periodMeta.label} (${periodMeta.time})`;

  let faculty = DATA.faculty.filter(f => f.has_timetable);

  if (keyword) {
    faculty = faculty.filter(f => {
      const haystack = [
        f.name, f.designation,
        ...f.busy.map(b => `${b.class_section} ${b.subject}`)
      ].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }

  const withStatus = faculty.map(f => {
    const busyEntry = findBusyEntry(f, day, periodId);
    return { f, busyEntry, free: !busyEntry };
  });

  withStatus.sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    return a.f.name.localeCompare(b.f.name);
  });

  const freeCount = withStatus.filter(x => x.free).length;
  resultsCount.textContent = `${freeCount} free / ${withStatus.length}`;

  resultsList.innerHTML = "";
  if (withStatus.length === 0) {
    resultsList.innerHTML = `<div class="empty-state">No faculty match that filter.</div>`;
  } else {
    withStatus.forEach(({ f, busyEntry, free }) => {
      resultsList.appendChild(renderCard(f, busyEntry, free));
    });
  }
}

function renderCard(f, busyEntry, free) {
  const card = document.createElement("div");
  card.className = `faculty-card ${free ? "free" : "busy"}`;

  const reviewBadge = busyEntry && busyEntry.review ? ` <span class="review-dot" title="Needs verification"></span>` : "";

  card.innerHTML = `
    <h3>${escapeHtml(f.name)}</h3>
    <div class="desig">${escapeHtml(f.designation || "")}</div>
    <div class="status">${free ? "Free" : "Busy"}${reviewBadge}</div>
    ${busyEntry ? `<div class="busy-detail">${escapeHtml(busyEntry.class_section)} — ${escapeHtml(busyEntry.subject)}${busyEntry.room ? " · " + escapeHtml(busyEntry.room) : ""}</div>` : ""}
    ${f.mobile ? `<div class="contact">📞 ${escapeHtml(f.mobile)}</div>` : ""}
    ${f.email ? `<div class="contact"><a href="mailto:${escapeHtml(f.email)}">${escapeHtml(f.email)}</a></div>` : ""}
  `;
  return card;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* ── Visitor counter (countapi.xyz – free, no signup) ── */
async function trackVisit() {
  try {
    const res = await fetch("https://api.countapi.xyz/hit/aghaz-hub-faculty-adjustment-finder/visits");
    const data = await res.json();
    if (visitCountEl && data.value != null) {
      visitCountEl.textContent = data.value.toLocaleString();
    }
  } catch (e) {
    if (visitCountEl) visitCountEl.textContent = "—";
  }
}
