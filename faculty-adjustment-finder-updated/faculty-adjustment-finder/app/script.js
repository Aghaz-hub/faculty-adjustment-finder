const DATA_URL = "../data/timetable_data.json";

let DATA = null;

const daySelect = document.getElementById("day-select");
const periodSelect = document.getElementById("period-select");
const deptFilter = document.getElementById("dept-filter");
const resultsList = document.getElementById("results-list");
const resultsTitle = document.getElementById("results-title");
const resultsCount = document.getElementById("results-count");
const dataNote = document.getElementById("data-note");

/** Max periods on a day before a free faculty is treated as "high load". */
const HIGH_LOAD_THRESHOLD = 4;

init();

async function init() {
  try {
    const res = await fetch(DATA_URL);
    DATA = await res.json();
  } catch (err) {
    resultsTitle.textContent = "Could not load timetable data";
    resultsList.innerHTML = `<div class="empty-state">Run <code>scripts/build_json.py</code> to generate data/timetable_data.json, then reload.</div>`;
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

/** Total teaching periods a faculty has on a given day (labs spanning 2 count as 2). */
function dailyLoad(fac, day) {
  let load = 0;
  for (const b of fac.busy) {
    if (b.day !== day) continue;
    load += (b.period_end - b.period_start + 1);
  }
  return load;
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
    const load = dailyLoad(f, day);
    return { f, busyEntry, free: !busyEntry, load };
  });

  // Free first, then by ascending daily load (lighter load preferred), then name.
  // Busy faculty sorted by name only (after all free).
  withStatus.sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    if (a.free && b.free) {
      if (a.load !== b.load) return a.load - b.load;
    }
    return a.f.name.localeCompare(b.f.name);
  });

  const freeCount = withStatus.filter(x => x.free).length;
  const lowLoadFree = withStatus.filter(x => x.free && x.load < HIGH_LOAD_THRESHOLD).length;
  resultsCount.textContent = `${freeCount} free / ${withStatus.length}` +
    (freeCount ? ` · ${lowLoadFree} under ${HIGH_LOAD_THRESHOLD} periods` : "");

  resultsList.innerHTML = "";
  if (withStatus.length === 0) {
    resultsList.innerHTML = `<div class="empty-state">No faculty match that filter.</div>`;
  } else {
    withStatus.forEach(({ f, busyEntry, free, load }) => {
      resultsList.appendChild(renderCard(f, busyEntry, free, load));
    });
  }

  renderDataNote();
}

function renderCard(f, busyEntry, free, load) {
  const card = document.createElement("div");

  let loadClass = "";
  if (free) {
    // Green if load < 4 periods that day; red if already 4 or more.
    loadClass = load < HIGH_LOAD_THRESHOLD ? "load-low" : "load-high";
  }
  card.className = `faculty-card ${free ? "free" : "busy"} ${loadClass}`.trim();

  const reviewBadge = busyEntry && busyEntry.review
    ? ` <span class="review-dot" title="Needs verification"></span>`
    : "";

  const loadLine = free
    ? `<div class="load-line">${load} period${load === 1 ? "" : "s"} today</div>`
    : "";

  const statusText = free
    ? (load < HIGH_LOAD_THRESHOLD ? "Free — preferred" : "Free — high load")
    : "Busy";

  card.innerHTML = `
    <h3>${escapeHtml(f.name)}</h3>
    <div class="desig">${escapeHtml(f.designation || "")}</div>
    <div class="status">${statusText}${reviewBadge}</div>
    ${loadLine}
    ${busyEntry
      ? `<div class="busy-detail">${escapeHtml(busyEntry.class_section)} — ${escapeHtml(busyEntry.subject)}${busyEntry.room ? " · " + escapeHtml(busyEntry.room) : ""}</div>`
      : ""}
    ${f.email || f.mobile
      ? `<div class="contact">${f.email ? `<a href="mailto:${escapeHtml(f.email)}">${escapeHtml(f.email)}</a>` : ""}${f.email && f.mobile ? " · " : ""}${f.mobile ? `<a href="tel:${escapeHtml(f.mobile)}">${escapeHtml(f.mobile)}</a>` : ""}</div>`
      : ""}
  `;
  return card;
}

function renderDataNote() {
  const total = DATA.faculty.length;
  const withTT = DATA.faculty.filter(f => f.has_timetable).length;
  dataNote.innerHTML = `
    <strong>${withTT} of ${total}</strong> faculty currently have a transcribed timetable loaded.
    Faculty without one are left out of the free/busy list above until their timetable is
    added to <code>data/timetable_data.csv</code> and <code>scripts/build_json.py</code> is re-run.
    <br><br>
    <strong>Load colours:</strong> free faculty with &lt; ${HIGH_LOAD_THRESHOLD} periods that day are highlighted in green (preferred);
    those already at ${HIGH_LOAD_THRESHOLD}+ periods are highlighted in red (avoid if possible). Sorted lightest load first.
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
