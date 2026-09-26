import { db, isUpcoming, isRecentlyCompleted, escapeHtml } from "./common.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { openEventModal } from "./event-detail.js";

const TYPE_COLORS = { Fest: "#ff6f91", Deadline: "#d64545", Seminar: "#3d7dca", Hackathon: "#8a4fd6", Camp: "#8c1d1d" };

let allEvents = [];
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
  return allEvents.filter(ev => isUpcoming(ev) || isRecentlyCompleted(ev));
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
    cell.className = "cal-day" + (dayEvents.length ? " has-events" : "");
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
renderMonth();

async function loadEvents() {
  try {
    const q = query(collection(db, "events"), where("status", "==", "approved"));
    const snap = await getDocs(q);
    allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMonth();
  } catch (e) {
    console.error("Failed to load events for calendar:", e);
    document.getElementById("day-panel").innerHTML =
      `<div class="note"><strong>Couldn't load events.</strong><p class="empty-note">Check your Firebase setup (see console for details).</p></div>`;
  }
}

loadEvents();
