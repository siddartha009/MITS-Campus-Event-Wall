import { db, isUpcoming, isRecentlyCompleted, escapeHtml, DEPARTMENTS, eventLevel, currentProfile, authReady } from "./common.js";
import { loadView, saveView } from "./view-state.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { openEventModal } from "./event-detail.js";
import { getDemoEvents, showDemoBanner, ENABLE_DEMO_FALLBACK } from "./demo-data.js";

const TYPE_COLORS = { Fest: "#d6457c", Cultural: "#b04bb8", Sports: "#e07b1f", Hackathon: "#6f4bd8", Workshop: "#0f8a8a", Seminar: "#2f7fd0", Competition: "#b8860b", Club: "#5b6b2e", Career: "#1f4e79", Camp: "#1f9558", Deadline: "#d63a32", Other: "#7a6a58" };

let allEvents = [];

// Level / department are shared with the Wall (view-state.js).
const saved = loadView();
let calTab = saved.scope === "inter" ? "inter" : saved.sub; // college | department | inter
let calDept = DEPARTMENTS.includes(saved.dept) ? saved.dept : DEPARTMENTS[0];
let deptFromUser = DEPARTMENTS.includes(saved.dept);

function inTab(ev, tab) {
  const lvl = eventLevel(ev);
  if (tab === "inter") return lvl === "inter-college";
  if (tab === "department") return lvl === "department" && ev.department === calDept;
  return lvl === "college";
}
const calSel = document.getElementById("cal-dept");
calSel.innerHTML = DEPARTMENTS.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
function saveTab() { saveView({ scope: calTab === "inter" ? "inter" : "college", sub: calTab === "department" ? "department" : "college", dept: calDept }); }
function syncTabs() {
  calSel.value = calDept;
  document.querySelectorAll("[data-cal]").forEach(el => {
    const on = el.dataset.cal === calTab;
    el.classList.toggle("active", on);
    el.setAttribute("aria-selected", String(on));
  });
  const pool = allEvents.filter(ev => isUpcoming(ev) || isRecentlyCompleted(ev));
  ["college", "department", "inter"].forEach(t => {
    document.querySelector(`[data-n="${t}"]`).textContent = pool.filter(ev => inTab(ev, t)).length;
  });
}
function pickTab(t) {
  if (t === calTab) return;
  calTab = t; saveTab(); document.getElementById("day-panel").innerHTML = ""; syncTabs(); renderMonth();
}
document.querySelectorAll("[data-cal]").forEach(b => b.addEventListener("click", (e) => { if (!e.target.closest("select")) pickTab(b.dataset.cal); }));
calSel.addEventListener("pointerdown", () => pickTab("department"));
calSel.addEventListener("keydown", () => pickTab("department"));
calSel.addEventListener("change", () => {
  calDept = calSel.value; deptFromUser = true; calTab = "department"; saveTab();
  document.getElementById("day-panel").innerHTML = ""; syncTabs(); renderMonth();
});
authReady.then(() => {
  const mine = currentProfile && currentProfile.department;
  if (!deptFromUser && mine && DEPARTMENTS.includes(mine)) { calDept = mine; syncTabs(); renderMonth(); }
});

let viewDate = new Date();
viewDate.setDate(1);

const dow = document.getElementById("cal-dow-row");
["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => {
  const el = document.createElement("div");
  el.className = "cal-dow";
  el.textContent = d;
  dow.appendChild(el);
});

function eventsInRangeOnly() {
  return allEvents.filter(ev => (isUpcoming(ev) || isRecentlyCompleted(ev)) && inTab(ev, calTab));
}

function eventsOnDate(dateStr) {
  return allEvents.filter(ev => ev.date === dateStr);
}

function renderMonth() {
  document.getElementById("cal-month-label").textContent =
    viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const inRange = eventsInRangeOnly();

  for (let i = 0; i < firstDow; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEvents = inRange.filter(e => e.date === dateStr);
    const cell = document.createElement("div");
    const now = new Date();
    const isToday = now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
    cell.className = "cal-day" + (dayEvents.length ? " has-events" : "") + (isToday ? " today" : "");
    cell.innerHTML = `<div class="dnum">${day}</div>
      <div class="dot-row">${dayEvents.map(e => `<span class="dot" style="background:${TYPE_COLORS[e.type] || '#999'}"></span>`).join("")}</div>`;
    cell.addEventListener("click", () => showDayPanel(dateStr, dayEvents));
    grid.appendChild(cell);
  }
}

function showDayPanel(dateStr, dayEvents) {
  const panel = document.getElementById("day-panel");
  const niceDate = new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (dayEvents.length === 0) {
    panel.innerHTML = `<div class="note"><strong>${niceDate}</strong><p class="empty-note">No events.</p></div>`;
    return;
  }
  if (dayEvents.length === 1) {
    const ev = dayEvents[0];
    panel.innerHTML = `<div class="note"><strong>${niceDate}</strong>
      <div class="poster-pick-row" style="margin-top:10px;">
        <div class="poster-pick" data-id="${ev.id}">
          ${ev.posterUrl ? `<img src="${ev.posterUrl}">` : `<div style="height:110px;background:#eee;border-radius:4px;"></div>`}
          <p>${escapeHtml(ev.title)}</p>
        </div>
      </div></div>`;
  } else {
    panel.innerHTML = `<div class="note"><strong>${niceDate}</strong> — ${dayEvents.length} events, pick one:
      <div class="poster-pick-row" style="margin-top:10px;">
        ${dayEvents.map(ev => `
          <div class="poster-pick" data-id="${ev.id}">
            ${ev.posterUrl ? `<img src="${ev.posterUrl}">` : `<div style="height:110px;background:#eee;border-radius:4px;"></div>`}
            <p>${escapeHtml(ev.title)}</p>
          </div>`).join("")}
      </div></div>`;
  }
  panel.querySelectorAll(".poster-pick").forEach(el => {
    el.addEventListener("click", () => {
      const ev = allEvents.find(e => e.id === el.dataset.id);
      if (ev) openEventModal(ev);
    });
  });
}

document.getElementById("prev-month").onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); renderMonth(); };
document.getElementById("next-month").onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); renderMonth(); };

// Draw the empty grid/month-label right away so the calendar always looks
// right even before (or if) the Firestore fetch below succeeds.
syncTabs();
renderMonth();

async function loadEvents() {
  try {
    const q = query(collection(db, "events"), where("status", "==", "approved"));
    const snap = await getDocs(q);
    allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Failed to load events for calendar:", e);
  }
  if (ENABLE_DEMO_FALLBACK && !allEvents.length) { allEvents = getDemoEvents(); showDemoBanner(); }
  syncTabs();
  renderMonth();
}

loadEvents();
