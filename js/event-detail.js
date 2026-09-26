import { db, storage, currentUser, formatDateTime, countdownText, isPast, escapeHtml } from "./common.js";
import { doc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

let backdropEl = null;

export function openEventModal(ev) {
  closeEventModal();
  backdropEl = document.createElement("div");
  backdropEl.className = "modal-backdrop";
  backdropEl.innerHTML = `<div class="modal" id="modal-inner"></div>`;
  backdropEl.addEventListener("click", (e) => { if (e.target === backdropEl) closeEventModal(); });
  document.body.appendChild(backdropEl);
  renderModalContent(ev);
}

export function closeEventModal() {
  if (backdropEl) { backdropEl.remove(); backdropEl = null; }
}

function renderModalContent(ev) {
  const inner = document.getElementById("modal-inner");
  const liked = currentUser && (ev.likedBy || []).includes(currentUser.uid);
  const past = isPast(ev);
  const isOwnerOrganizer = currentUser && currentUser.uid === ev.organizerId;
  const hasRecap = ev.recap && (ev.recap.summary || (ev.recap.photos && ev.recap.photos.length));

  inner.innerHTML = `
    <button class="modal-close" id="modal-close-btn">&times;</button>
    ${ev.posterUrl ? `<img class="poster-full" src="${ev.posterUrl}" alt="${escapeHtml(ev.title)} poster">` : ""}
    <span class="type-badge type-${ev.type}">${ev.type}</span>
    <h2 style="margin:6px 0 2px;">${escapeHtml(ev.title)}</h2>
    <div class="event-meta">${formatDateTime(ev)} · ${escapeHtml(ev.location || "")}</div>
    ${!past ? `<div class="countdown">${countdownText(ev)}</div>` : ""}
    <p style="margin-top:12px;">${escapeHtml(ev.description || "")}</p>
    ${ev.registrationLink ? `<a class="btn reg-link" href="${ev.registrationLink}" target="_blank" rel="noopener">Register / Learn more</a>` : ""}
    <div class="like-row">
      <span class="heart ${liked ? "liked" : ""}" id="modal-heart">${liked ? "♥" : "♡"}</span>
      <span>${(ev.likedBy || []).length} like${(ev.likedBy || []).length === 1 ? "" : "s"}</span>
    </div>
    <div id="modal-recap-area"></div>
  `;

  document.getElementById("modal-close-btn").onclick = closeEventModal;
  document.getElementById("modal-heart").onclick = () => toggleLike(ev);

  const recapArea = document.getElementById("modal-recap-area");
  if (past && hasRecap) {
    recapArea.innerHTML = renderRecap(ev);
  }
  if (past && isOwnerOrganizer) {
    const addBtnHtml = `<button class="btn secondary" id="add-recap-btn" style="margin-top:16px;">${hasRecap ? "Edit Recap" : "Add Recap"}</button>`;
    recapArea.insertAdjacentHTML("beforeend", addBtnHtml);
    document.getElementById("add-recap-btn").onclick = () => renderRecapForm(ev, recapArea);
  }
}

function renderRecap(ev) {
  const r = ev.recap || {};
  const photos = (r.photos || []).map(u => `<img src="${u}">`).join("");
  const testimonials = (r.testimonials || []).map(t => `
    <div class="testimonial">
      <strong>${escapeHtml(t.name)}</strong> — "${escapeHtml(t.quote)}"
      ${t.linkedinUrl ? `<a class="li-btn" href="${t.linkedinUrl}" target="_blank" rel="noopener" title="LinkedIn">in</a>` : ""}
    </div>`).join("");
  const winners = (r.winners || []).map(w => `
    <div class="winner-card">
      ${w.photoUrl ? `<img src="${w.photoUrl}">` : ""}
      <div><strong>${escapeHtml(w.name)}</strong></div>
      <div>${escapeHtml(w.prize)}</div>
    </div>`).join("");

  return `
    <div class="recap-section">
      <h3>Event Recap</h3>
      ${r.summary ? `<p>${escapeHtml(r.summary)}</p>` : ""}
      ${photos ? `<div class="gallery">${photos}</div>` : ""}
      ${testimonials ? `<h4>What attendees said</h4>${testimonials}` : ""}
      ${winners ? `<h4>Winners</h4><div style="display:flex;flex-wrap:wrap;">${winners}</div>` : ""}
    </div>
  `;
}

async function toggleLike(ev) {
  if (!currentUser) { window.location.href = "login.html"; return; }
  const ref_ = doc(db, "events", ev.id);
  const liked = (ev.likedBy || []).includes(currentUser.uid);
  await updateDoc(ref_, { likedBy: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid) });
  if (liked) ev.likedBy = ev.likedBy.filter(u => u !== currentUser.uid);
  else ev.likedBy = [...(ev.likedBy || []), currentUser.uid];
  renderModalContent(ev);
  window.dispatchEvent(new CustomEvent("event-liked", { detail: ev }));
}

function renderRecapForm(ev, container) {
  const r = ev.recap || {};
  container.innerHTML = `
    <div class="recap-section">
      <h3>${r.summary ? "Edit" : "Add"} Recap</h3>
      <div class="form-box" style="max-width:none;">
        <label>Summary</label>
        <textarea id="rf-summary">${escapeHtml(r.summary || "")}</textarea>
        <label>Photos (choose one or more)</label>
        <input type="file" id="rf-photos" accept="image/*" multiple>
        <label>Testimonials (one per line: Name | Quote | LinkedIn URL)</label>
        <textarea id="rf-testimonials">${(r.testimonials || []).map(t => `${t.name} | ${t.quote} | ${t.linkedinUrl || ""}`).join("\n")}</textarea>
        <label>Winners (one per line: Name | Prize)</label>
        <textarea id="rf-winners">${(r.winners || []).map(w => `${w.name} | ${w.prize}`).join("\n")}</textarea>
        <label>Winner photos (optional, same order as winners above)</label>
        <input type="file" id="rf-winner-photos" accept="image/*" multiple>
        <div style="margin-top:14px;display:flex;gap:10px;">
          <button class="btn" id="rf-save">Save Recap</button>
          <button class="btn secondary" id="rf-cancel">Cancel</button>
        </div>
        <div id="rf-msg" class="form-msg" style="display:none;"></div>
      </div>
    </div>
  `;
  document.getElementById("rf-cancel").onclick = () => renderModalContent(ev);
  document.getElementById("rf-save").onclick = () => saveRecap(ev, container);
}

async function saveRecap(ev, container) {
  const msg = document.getElementById("rf-msg");
  msg.style.display = "block"; msg.className = "form-msg"; msg.textContent = "Saving...";
  try {
    const summary = document.getElementById("rf-summary").value.trim();
    const photoFiles = document.getElementById("rf-photos").files;
    const winnerPhotoFiles = document.getElementById("rf-winner-photos").files;

    const photoUrls = [...(ev.recap?.photos || [])];
    for (const file of photoFiles) {
      const path = `recaps/${ev.id}/${Date.now()}_${file.name}`;
      const sref = ref(storage, path);
      await uploadBytes(sref, file);
      photoUrls.push(await getDownloadURL(sref));
    }

    const testimonials = document.getElementById("rf-testimonials").value.split("\n")
      .map(l => l.trim()).filter(Boolean)
      .map(l => {
        const [name, quote, linkedinUrl] = l.split("|").map(s => (s || "").trim());
        return { name: name || "", quote: quote || "", linkedinUrl: linkedinUrl || "" };
      });

    const winnerLines = document.getElementById("rf-winners").value.split("\n")
      .map(l => l.trim()).filter(Boolean);
    const winnerPhotoUrls = [];
    for (const file of winnerPhotoFiles) {
      const path = `recaps/${ev.id}/winners/${Date.now()}_${file.name}`;
      const sref = ref(storage, path);
      await uploadBytes(sref, file);
      winnerPhotoUrls.push(await getDownloadURL(sref));
    }
    const winners = winnerLines.map((l, i) => {
      const [name, prize] = l.split("|").map(s => (s || "").trim());
      return { name: name || "", prize: prize || "", photoUrl: winnerPhotoUrls[i] || (ev.recap?.winners?.[i]?.photoUrl || "") };
    });

    const recap = { summary, photos: photoUrls, testimonials, winners };
    await updateDoc(doc(db, "events", ev.id), { recap });
    ev.recap = recap;
    msg.className = "form-msg ok"; msg.textContent = "Recap saved.";
    setTimeout(() => renderModalContent(ev), 700);
  } catch (e) {
    console.error(e);
    msg.className = "form-msg err"; msg.textContent = "Could not save recap: " + e.message;
  }
}
