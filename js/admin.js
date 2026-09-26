import { db, requireAdmin, escapeHtml } from "./common.js";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const msgEl = document.getElementById("admin-msg");
const listEl = document.getElementById("pending-list");

async function loadPending() {
  const q = query(collection(db, "events"), where("status", "==", "pending"));
  const snap = await getDocs(q);
  const pending = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (!pending.length) {
    listEl.innerHTML = `<p class="empty-note">No pending submissions right now.</p>`;
    return;
  }

  listEl.innerHTML = pending.map(ev => `
    <div class="note admin-row" data-id="${ev.id}" style="margin-bottom:16px;">
      ${ev.posterUrl ? `<img src="${ev.posterUrl}">` : `<div style="width:110px;height:80px;background:#eee;border-radius:4px;"></div>`}
      <div class="admin-info">
        <span class="type-badge type-${ev.type}">${ev.type}</span>
        <h3 style="margin:4px 0;">${escapeHtml(ev.title)}</h3>
        <div class="event-meta">${ev.date} ${ev.time || ""} · ${escapeHtml(ev.location || "")}</div>
        <p style="margin:6px 0;">${escapeHtml(ev.description || "")}</p>
        <div class="admin-actions">
          <button class="btn" data-action="approve">Approve</button>
          <button class="btn danger" data-action="reject">Reject</button>
        </div>
      </div>
    </div>
  `).join("");

  listEl.querySelectorAll(".admin-row").forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-action="approve"]').onclick = async () => {
      await updateDoc(doc(db, "events", id), { status: "approved" });
      loadPending();
    };
    row.querySelector('[data-action="reject"]').onclick = async () => {
      await deleteDoc(doc(db, "events", id));
      loadPending();
    };
  });
}

requireAdmin(msgEl).then(ok => { if (ok) loadPending(); });
