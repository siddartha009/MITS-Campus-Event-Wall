import { db, currentUser, TYPES, isUpcoming, isRecentlyCompleted, isInCurrentCalendarMonth,
  formatDateTime, countdownText, isPast, escapeHtml,
  DEPARTMENTS, currentProfile, eventLevel, levelLabel, authReady } from "./common.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { openEventModal } from "./event-detail.js";
import { loadView, saveView } from "./view-state.js";
import { getDemoEvents, showDemoBanner, ENABLE_DEMO_FALLBACK } from "./demo-data.js";

let allEvents = [];
// The level and department are shared with the Calendar page (see view-state.js).
const saved = loadView();
let activeScope = saved.scope; // "college" = college-wide + department events; "inter" = inter-college events
let activeSub = saved.sub;     // inside "college": college | department
let activeType = "All";
let activeTab = "highlights";
let searchTerm = "";

// Department defaults to the one you last viewed, otherwise your own department.
let activeDept = DEPARTMENTS.includes(saved.dept) ? saved.dept : DEPARTMENTS[0];
let deptFromUser = DEPARTMENTS.includes(saved.dept);
function setDept(d, byUser) {
  activeDept = d;
  if (byUser) { deptFromUser = true; saveView({ dept: d }); }
}
function applyProfileDept() {
  const mine = currentProfile && currentProfile.department;
  if (!deptFromUser && mine && DEPARTMENTS.includes(mine)) activeDept = mine;
}

// Inter-college events are their own cluster; everything else counts as "college level".
const scopeOf = (ev) => (eventLevel(ev) === "inter-college" ? "inter" : "college");

function matchesScope(ev) {
  if (scopeOf(ev) !== activeScope) return false;
  if (activeScope !== "college") return true;
  if (activeSub === "department") return eventLevel(ev) === "department" && ev.department === activeDept;
  return eventLevel(ev) === "college";
}

function matchesFilters(ev) {
  const typeOk = activeType === "All" || ev.type === activeType;
  const searchOk = !searchTerm ||
    (ev.title || "").toLowerCase().includes(searchTerm) ||
    (ev.description || "").toLowerCase().includes(searchTerm);
  return matchesScope(ev) && typeOk && searchOk;
}

const levelBox = document.getElementById("level-box");
const deptSel = document.getElementById("dept-select");
const catTabs = document.getElementById("cat-tabs");
const searchBox = document.getElementById("search");

// Top-right: College level | Inter-college
document.querySelectorAll(".scope-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    activeScope = btn.dataset.scope;
    activeType = "All";
    saveView({ scope: activeScope });
    renderAll();
  });
});

// Right corner: College-wide | Department toggle
document.querySelectorAll(".level-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    if (e.target.closest("select")) return; // the dropdown handles its own clicks
    activeSub = btn.dataset.sub;
    activeType = "All";
    saveView({ sub: activeSub });
    renderAll();
  });
});
deptSel.innerHTML = DEPARTMENTS.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
// Opening the dropdown switches to Department level right away; picking a department keeps it there.
function activateDept() {
  if (activeSub === "department") return;
  activeSub = "department"; activeType = "All";
  saveView({ sub: activeSub });
  buildFilters();
  renderAll();
}
deptSel.addEventListener("pointerdown", activateDept);
deptSel.addEventListener("keydown", activateDept);
deptSel.addEventListener("change", () => { setDept(deptSel.value, true); activeSub = "department"; saveView({ sub: "department" }); activeType = "All"; renderAll(); });

// Category tabs: same for college level, department and inter-college; counts reflect what is in the chosen view.
function buildFilters() {
  document.querySelectorAll(".scope-btn").forEach(b => {
    const on = b.dataset.scope === activeScope;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  levelBox.hidden = activeScope !== "college";
  document.querySelectorAll(".level-btn").forEach(b => {
    const on = b.dataset.sub === activeSub;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  deptSel.value = activeDept;

  // Categories reflect only the events active in the current tab (Upcoming or Completed) for the chosen level.
  const inTab = activeTab === "completed" ? isRecentlyCompleted : isUpcoming;
  const pool = allEvents.filter(matchesScope).filter(inTab);
  const counts = {};
  pool.forEach(ev => { counts[ev.type] = (counts[ev.type] || 0) + 1; });
  const types = [...TYPES.filter(t => counts[t]), ...Object.keys(counts).filter(t => !TYPES.includes(t))];
  if (activeType !== "All" && !counts[activeType]) activeType = "All";
  const chip = (val, label, n) =>
    `<button class="cat-btn${activeType === val ? " active" : ""}" data-type="${escapeHtml(val)}" role="tab" aria-selected="${activeType === val}">${escapeHtml(label)} <span class="cat-n">${n}</span></button>`;
  catTabs.innerHTML = chip("All", "All", pool.length) + types.map(t => chip(t, t, counts[t])).join("");
}
catTabs.addEventListener("click", (e) => {
  const b = e.target.closest(".cat-btn");
  if (!b) return;
  activeType = b.dataset.type;
  renderAll();
});
searchBox.addEventListener("input", (e) => {
  searchTerm = e.target.value.toLowerCase().trim();
  renderAll();
});

function cardHtml(ev, tiltClass) {
  const liked = (ev.likedBy || []).includes(currentUser ? currentUser.uid : "demo-visitor") && (currentUser || String(ev.id).startsWith("demo-"));
  const past = isPast(ev);
  return `
    <div class="note event-card ${tiltClass}" data-id="${ev.id}">
      <div class="poster-wrap">
        ${ev.posterUrl ? `<img class="poster" src="${ev.posterUrl}" alt="${escapeHtml(ev.title)} poster">` : ""}
        <span class="type-badge type-${escapeHtml(ev.type)}">${escapeHtml(ev.type)}</span>
      </div>
      <h3>${escapeHtml(ev.title)}</h3>
      <span class="level-tag level-${eventLevel(ev)}">${escapeHtml(levelLabel(ev))}</span>
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

// ---- Monthly Highlights: top 3 of the month on a gold / silver / bronze podium ----
const likesOf = (ev) => (ev.likedBy || []).length;
const peopleOf = (ev) => (ev.recap && Number.isFinite(ev.recap.participants) ? ev.recap.participants : null);
const engagementOf = (ev) => likesOf(ev) + (peopleOf(ev) || 0); // engagement = likes + recorded participants
const MEDALS = [
  { cls: "gold", icon: "🥇", name: "Gold" },
  { cls: "silver", icon: "🥈", name: "Silver" },
  { cls: "bronze", icon: "🥉", name: "Bronze" }
];

function renderPodium(events) {
  const el = document.getElementById("highlights-grid");
  const month = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  el.className = "podium-wrap";
  if (!events.length) {
    el.innerHTML = `<p class="empty-note">No events to rank yet in ${month}. Like an event to put it on the board!</p>`;
    return;
  }
  const ranked = events.slice().sort((a, b) => engagementOf(b) - engagementOf(a) || likesOf(b) - likesOf(a)).slice(0, 3);
  const maxLikes = Math.max(1, ...ranked.map(likesOf));
  const maxPeople = Math.max(1, ...ranked.map(e => peopleOf(e) || 0));
  const totalEng = events.reduce((n, e) => n + engagementOf(e), 0) || 1;
  const pct = (v, m) => Math.max(4, Math.round((v / m) * 100));

  const card = (ev, i) => {
    const m = MEDALS[i];
    const likes = likesOf(ev), people = peopleOf(ev), eng = engagementOf(ev);
    const lead = i === 0
      ? (ranked[1] ? `+${eng - engagementOf(ranked[1])} ahead of #2` : "Top of the month")
      : `${engagementOf(ranked[0]) - eng} behind #1`;
    return `
      <div class="podium-card ${m.cls} place-${i + 1}" data-id="${ev.id}" tabindex="0" role="button" aria-label="${m.name}: ${escapeHtml(ev.title)}">
        <div class="medal">${m.icon}<span>#${i + 1} · ${m.name}</span></div>
        <div class="poster-wrap">
          ${ev.posterUrl ? `<img class="poster" src="${ev.posterUrl}" alt="${escapeHtml(ev.title)} poster">` : `<div class="poster ph"></div>`}
          <span class="type-badge type-${escapeHtml(ev.type)}">${escapeHtml(ev.type)}</span>
        </div>
        <h3>${escapeHtml(ev.title)}</h3>
        <span class="level-tag level-${eventLevel(ev)}">${escapeHtml(levelLabel(ev))}</span>
        <div class="event-meta">${formatDateTime(ev)}</div>
        <div class="stat">
          <div class="stat-top"><span>♥ Likes</span><b>${likes}</b></div>
          <div class="stat-bar"><span style="width:${pct(likes, maxLikes)}%"></span></div>
        </div>
        <div class="stat">
          <div class="stat-top"><span>👥 Participants</span><b>${people === null ? "—" : people}</b></div>
          <div class="stat-bar"><span style="width:${people === null ? 0 : pct(people, maxPeople)}%"></span></div>
          ${people === null ? `<div class="stat-note">Organizer adds this in the recap</div>` : ""}
        </div>
        <div class="why">${m.icon} ${eng > 0 && eng / totalEng < 0.005 ? "<1" : Math.round((eng / totalEng) * 100)}% of ${new Date().toLocaleDateString(undefined, { month: "long" })}'s engagement · ${lead}</div>
      </div>`;
  };
  el.innerHTML = `
    <div class="podium-head"><h2>🏆 ${month} Highlights</h2>
      <p>The three most-loved events this month, ranked by likes plus participants.</p></div>
    <div class="podium">${ranked.map(card).join("")}</div>`;
  el.querySelectorAll(".podium-card").forEach(c => {
    const open = () => { const ev = allEvents.find(e => e.id === c.dataset.id); if (ev) openEventModal(ev); };
    c.addEventListener("click", open);
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
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
      activeTab = btn.dataset.tab;
      renderAll();
      document.querySelectorAll(".tab-panel").forEach(p => { p.hidden = true; });
      document.getElementById("panel-" + btn.dataset.tab).hidden = false;
    });
  });
}

function renderAll() {
  buildFilters();
  const filtered = allEvents.filter(matchesFilters);

  const upcoming = filtered.filter(isUpcoming).sort((a, b) => new Date(a.date) - new Date(b.date));
  const completed = filtered.filter(isRecentlyCompleted).sort((a, b) => new Date(b.date) - new Date(a.date));
  // Monthly Highlights are their own page: ignore the category and search filters, keep the level you are viewing.
  const highlights = allEvents.filter(matchesScope).filter(isInCurrentCalendarMonth);
  document.getElementById("cat-row").hidden = activeTab === "highlights";

  const where = activeScope === "inter" ? "inter-college events"
    : activeSub === "department" ? activeDept + " department events" : "college-wide events";
  renderGrid("upcoming-grid", upcoming, `No upcoming ${where} in the next month.`);
  renderGrid("completed-grid", completed, `No ${where} completed in the last month.`);
  renderPodium(highlights);
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

initTabs();
// The wall is public: anyone can browse. (Liking, commenting and voting need a verified account.)
renderAll();
loadEvents();
authReady.then(() => { applyProfileDept(); renderAll(); }); // hearts depend on who is logged in
setInterval(() => {
  document.querySelectorAll("[data-countdown]").forEach(el => {
    const ev = allEvents.find(e => e.id === el.dataset.countdown);
    if (ev) el.textContent = countdownText(ev);
  });
}, 30000);

window.addEventListener("event-liked", () => renderAll());
