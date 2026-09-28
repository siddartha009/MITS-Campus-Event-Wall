import { db, currentUser, TYPES, isUpcoming, isRecentlyCompleted, isInCurrentCalendarMonth,
  formatDateTime, countdownText, isPast, escapeHtml } from "./common.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { openEventModal } from "./event-detail.js";
import { getDemoEvents, showDemoBanner, ENABLE_DEMO_FALLBACK } from "./demo-data.js";

let allEvents = [];
let activeType = "All";
let searchTerm = "";

function buildChips() {
  const row = document.getElementById("chip-row");
  row.innerHTML = "";
  ["All", ...TYPES].forEach(t => {
    const chip = document.createElement("button");
    chip.className = "chip" + (t === activeType ? " active" : "");
    chip.textContent = t;
    chip.onclick = () => { activeType = t; buildChips(); renderAll(); };
    row.appendChild(chip);
  });
}

document.getElementById("search").addEventListener("input", (e) => {
  searchTerm = e.target.value.toLowerCase().trim();
  renderAll();
});

function matchesFilters(ev) {
  const typeOk = activeType === "All" || ev.type === activeType;
  const searchOk = !searchTerm ||
    (ev.title || "").toLowerCase().includes(searchTerm) ||
    (ev.description || "").toLowerCase().includes(searchTerm);
  return typeOk && searchOk;
}

function cardHtml(ev, tiltClass) {
  const liked = (ev.likedBy || []).includes(currentUser ? currentUser.uid : "demo-visitor") && (currentUser || String(ev.id).startsWith("demo-"));
  const past = isPast(ev);
  return `
    <div class="note event-card ${tiltClass}" data-id="${ev.id}">
      ${ev.posterUrl ? `<img class="poster" src="${ev.posterUrl}" alt="">` : ""}
      <span class="type-badge type-${ev.type}">${ev.type}</span>
      <h3>${escapeHtml(ev.title)}</h3>
      <div class="event-meta">${formatDateTime(ev)}</div>
      <div class="event-meta">${escapeHtml(ev.location || "")}</div>
      ${!past ? `<div class="countdown" data-countdown="${ev.id}">${countdownText(ev)}</div>` : ""}
      <div class="like-row">
        <span class="heart ${liked ? "liked" : ""}">${liked ? "♥" : "♡"}</span>
        <span>${(ev.likedBy || []).length}</span>
      </div>
    </div>
  `;
}

function renderGrid(elId, events, emptyMsg) {
  const el = document.getElementById(elId);
  if (!events.length) { el.innerHTML = `<p class="empty-note">${emptyMsg}</p>`; return; }
  el.innerHTML = events.map((ev, i) => cardHtml(ev, i % 2 === 0 ? "tilt-l" : "tilt-r")).join("");
  el.querySelectorAll(".event-card").forEach(card => {
    card.addEventListener("click", () => {
      const ev = allEvents.find(e => e.id === card.dataset.id);
      if (ev) openEventModal(ev);
    });
  });
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      document.querySelectorAll(".tab-panel").forEach(p => { p.hidden = true; });
      document.getElementById("panel-" + btn.dataset.tab).hidden = false;
    });
  });
}

function renderAll() {
  const filtered = allEvents.filter(matchesFilters);

  const upcoming = filtered.filter(isUpcoming).sort((a, b) => new Date(a.date) - new Date(b.date));
  const completed = filtered.filter(isRecentlyCompleted).sort((a, b) => new Date(b.date) - new Date(a.date));

  const highlights = allEvents
    .filter(isInCurrentCalendarMonth)
    .slice()
    .sort((a, b) => (b.likedBy?.length || 0) - (a.likedBy?.length || 0))
    .slice(0, 3);

  renderGrid("upcoming-grid", upcoming, "No upcoming events in the next month.");
  renderGrid("completed-grid", completed, "No events completed in the last month.");
  renderGrid("highlights-grid", highlights, "No highlights yet this month — like an event to put it on the board!");
}

async function loadEvents() {
  try {
    const q = query(collection(db, "events"), where("status", "==", "approved"));
    const snap = await getDocs(q);
    allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Failed to load events for home page:", e);
  }
  if (ENABLE_DEMO_FALLBACK && !allEvents.length) { allEvents = getDemoEvents(); showDemoBanner(); }
  renderAll();
}

buildChips();
initTabs();
renderAll(); // shows "no events" placeholders immediately, replaced once data (or an error) resolves
loadEvents();
setInterval(() => {
  document.querySelectorAll("[data-countdown]").forEach(el => {
    const ev = allEvents.find(e => e.id === el.dataset.countdown);
    if (ev) el.textContent = countdownText(ev);
  });
}, 30000);

window.addEventListener("event-liked", () => renderAll());
