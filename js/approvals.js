import { db, authReady, currentUser, currentProfile, isAdminProfile, isHodProfile, escapeHtml } from "./common.js";
import { collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const msgEl = document.getElementById("ap-msg");
const listEl = document.getElementById("ap-list");

authReady.then(() => {
  if (!currentUser || !(isAdminProfile() || isHodProfile())) {
    msgEl.textContent = "Only HODs and the admin can approve faculty. Redirecting home...";
    setTimeout(() => (window.location.href = "index.html"), 1200);
    return;
  }
  msgEl.textContent = isAdminProfile()
    ? "All departments. Approve or reject faculty, and choose who is HOD of each department."
    : `Faculty of ${currentProfile.department}: approve or reject once their mail is verified.`;
  load();
});

function row(u, buttons) {
  return `<div class="note admin-row" data-id="${u.id}" style="margin-bottom:22px;">
    <div class="admin-info">
      <span class="level-tag level-department">${escapeHtml(u.department || "")}</span>
      <h3 style="margin:4px 0;">${escapeHtml(u.name || "")}</h3>
      <div class="event-meta">${escapeHtml(u.email || "")}${u.role === "hod" ? " · HOD" : ""}</div>
      <div class="admin-actions">${buttons}</div>
    </div></div>`;
}

async function load() {
  listEl.innerHTML = `<p class="empty-note">Loading...</p>`;
  try {
    const users = collection(db, "users");
    const facultyQ = isAdminProfile()
      ? query(users, where("role", "==", "faculty"))
      : query(users, where("role", "==", "faculty"), where("department", "==", currentProfile.department));
    const faculty = (await getDocs(facultyQ)).docs.map(d => ({ id: d.id, ...d.data() }));
    const hods = isAdminProfile() ? (await getDocs(query(users, where("role", "==", "hod")))).docs.map(d => ({ id: d.id, ...d.data() })) : [];

    const waiting = faculty.filter(u => u.status === "pending" && u.mailVerified);
    const unverified = faculty.filter(u => u.status === "pending" && !u.mailVerified);
    const approved = faculty.filter(u => u.status === "approved");
    const rejected = faculty.filter(u => u.status === "rejected");

    const section = (title, items, buttons, empty) => `<h2 class="section-title">${title}</h2>` +
      (items.length ? items.map(u => row(u, buttons(u))).join("") : `<p class="empty-note">${empty}</p>`);
    const act = (a, label, cls = "") => `<button class="btn ${cls}" data-action="${a}">${label}</button>`;

    listEl.innerHTML =
      section("Waiting for your decision", waiting, () => act("approve", "Approve") + act("reject", "Reject", "danger"), "Nobody is waiting right now.") +
      section("Mail not verified yet", unverified, () => `<span class="event-meta">They need to open the verification link first.</span>`, "None.") +
      section("Approved faculty", approved, () => isAdminProfile() ? act("makehod", "Make HOD", "secondary") + act("reject", "Remove access", "danger") : act("reject", "Remove access", "danger"), "None yet.") +
      (isAdminProfile() ? section("Heads of department", hods, () => act("unhod", "Remove HOD role", "secondary"), "No HODs assigned yet. Approve a faculty member, then choose Make HOD.") : "") +
      section("Rejected", rejected, () => act("approve", "Approve instead", "secondary"), "None.");

    const all = [...faculty, ...hods];
    listEl.querySelectorAll(".admin-row").forEach(r => {
      const u = all.find(x => x.id === r.dataset.id);
      r.querySelectorAll("[data-action]").forEach(b => {
        b.onclick = async () => {
          const changes = { approve: { status: "approved" }, reject: { status: "rejected" }, makehod: { role: "hod" }, unhod: { role: "faculty" } }[b.dataset.action];
          if (b.dataset.action === "makehod" && !confirm(`Make ${u.name} the HOD of ${u.department}? They will be able to approve faculty in that department.`)) return;
          try { await updateDoc(doc(db, "users", u.id), changes); load(); }
          catch (e) { console.error(e); alert("Couldn't update: " + e.message); }
        };
      });
    });
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="empty-note">Couldn't load: ${escapeHtml(e.message)}</p>`;
  }
}
