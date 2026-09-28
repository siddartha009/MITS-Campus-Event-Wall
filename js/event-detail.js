import { db, currentUser, formatDateTime, countdownText, isPast, escapeHtml, fileToCompressedDataURL } from "./common.js";
import { doc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

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

function hasRecapContent(ev) {
  const r = ev.recap || {};
  return !!(r.summary || r.additionalInfo || (r.photos && r.photos.length) ||
    (r.testimonials && r.testimonials.length) || (r.winners && r.winners.length));
}

function renderModalContent(ev) {
  const inner = document.getElementById("modal-inner");
  const liked = (ev.likedBy || []).includes(currentUser ? currentUser.uid : "demo-visitor");
  const past = isPast(ev);
  const isOwnerOrganizer = !!currentUser && currentUser.uid === ev.organizerId;
  const hasRecap = hasRecapContent(ev);

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
    wirePhotoViewer(recapArea, ev);
  }
  if (isOwnerOrganizer && past) {
    const addBtnHtml = `<button class="btn secondary" id="add-recap-btn" style="margin-top:16px;">${hasRecap ? "Edit Recap" : "Add Recap"}</button>`;
    recapArea.insertAdjacentHTML("beforeend", addBtnHtml);
    document.getElementById("add-recap-btn").onclick = () => renderRecapForm(ev, recapArea);
  } else if (isOwnerOrganizer) {
    recapArea.insertAdjacentHTML("beforeend",
      `<p class="empty-note" style="margin-top:16px;">📝 You organized this event — you can add a recap here once the event date has passed.</p>`);
  }
}

// ---- Full-size photo viewer (click a recap photo to open; save button included) ----
let lightboxCleanup = null;

function closeLightbox() {
  if (lightboxCleanup) { lightboxCleanup(); lightboxCleanup = null; }
}

function wirePhotoViewer(area, ev) {
  const photos = (ev.recap && ev.recap.photos) || [];
  area.querySelectorAll(".gallery img").forEach((img, i) => {
    img.style.cursor = "zoom-in";
    img.title = "Click to view full size";
    img.onclick = () => openLightbox(photos, i);
  });
  area.querySelectorAll(".winner-card img").forEach(img => {
    img.style.cursor = "zoom-in";
    img.onclick = () => openLightbox([img.src], 0);
  });
}

function openLightbox(urls, startIndex) {
  closeLightbox();
  let i = startIndex;
  const many = urls.length > 1;
  const round = "background:rgba(255,255,255,.18);color:#fff;border:none;border-radius:50%;cursor:pointer;font-family:inherit;";

  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0;z-index:100;background:rgba(20,18,40,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;";
  el.innerHTML = `
    <button id="lb-close" aria-label="Close" style="${round}position:absolute;top:14px;right:14px;width:42px;height:42px;font-size:1.5em;">&times;</button>
    ${many ? `
      <button id="lb-prev" aria-label="Previous photo" style="${round}position:absolute;left:14px;top:50%;transform:translateY(-50%);width:46px;height:46px;font-size:1.8em;">&#8249;</button>
      <button id="lb-next" aria-label="Next photo" style="${round}position:absolute;right:14px;top:50%;transform:translateY(-50%);width:46px;height:46px;font-size:1.8em;">&#8250;</button>` : ""}
    <img id="lb-img" alt="Event photo" style="max-width:92vw;max-height:78vh;object-fit:contain;border-radius:12px;">
    <div style="margin-top:14px;display:flex;gap:14px;align-items:center;color:#fff;font-weight:700;">
      <span id="lb-count"></span>
      <a id="lb-download" class="btn" style="display:inline-block;text-decoration:none;">&#11015; Save photo</a>
    </div>`;
  document.body.appendChild(el);

  const show = () => {
    el.querySelector("#lb-img").src = urls[i];
    const dl = el.querySelector("#lb-download");
    dl.href = urls[i];
    dl.download = `event-photo-${i + 1}.jpg`;
    el.querySelector("#lb-count").textContent = many ? `${i + 1} / ${urls.length}` : "";
  };
  const step = (d) => { i = (i + d + urls.length) % urls.length; show(); };

  const onKey = (e) => {
    if (e.key === "Escape") closeLightbox();
    else if (many && e.key === "ArrowLeft") step(-1);
    else if (many && e.key === "ArrowRight") step(1);
  };
  document.addEventListener("keydown", onKey);
  lightboxCleanup = () => { document.removeEventListener("keydown", onKey); el.remove(); };

  el.addEventListener("click", (e) => { if (e.target === el) closeLightbox(); });
  el.querySelector("#lb-close").onclick = closeLightbox;
  if (many) {
    el.querySelector("#lb-prev").onclick = () => step(-1);
    el.querySelector("#lb-next").onclick = () => step(1);
  }
  show();
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
      ${r.additionalInfo ? `<h4>More details</h4><p style="white-space:pre-wrap;">${escapeHtml(r.additionalInfo)}</p>` : ""}
      ${testimonials ? `<h4>What attendees said</h4>${testimonials}` : ""}
      ${winners ? `<h4>Winners</h4><div style="display:flex;flex-wrap:wrap;">${winners}</div>` : ""}
    </div>
  `;
}

async function toggleLike(ev) {
  if (String(ev.id).startsWith("demo-")) {
    // demo events aren't in Firestore - toggle the like locally only
    const me = currentUser ? currentUser.uid : "demo-visitor";
    ev.likedBy = (ev.likedBy || []).includes(me) ? ev.likedBy.filter(u => u !== me) : [...(ev.likedBy || []), me];
    renderModalContent(ev);
    window.dispatchEvent(new CustomEvent("event-liked", { detail: ev }));
    return;
  }
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
  let keptPhotos = [...(r.photos || [])];
  const hint = 'style="font-weight:600;color:var(--ink-light);"';

  container.innerHTML = `
    <div class="recap-section">
      <h3>${hasRecapContent(ev) ? "Edit" : "Add"} Recap</h3>
      <div class="form-box" style="max-width:none;">
        <label>Summary</label>
        <textarea id="rf-summary" placeholder="How did the event go? A few lines is enough.">${escapeHtml(r.summary || "")}</textarea>

        <label>Photos <span ${hint}>(optional)</span></label>
        <div id="rf-thumbs" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;"></div>
        <input type="file" id="rf-photos" accept="image/*" multiple>

        <label>Additional information <span ${hint}>(optional)</span></label>
        <textarea id="rf-extra" placeholder="Winners, thank-yous, links — anything else worth sharing.">${escapeHtml(r.additionalInfo || "")}</textarea>

        <div style="margin-top:14px;display:flex;gap:10px;">
          <button class="btn" id="rf-save">Save Recap</button>
          <button class="btn secondary" id="rf-cancel">Cancel</button>
        </div>
        <div id="rf-msg" class="form-msg" style="display:none;"></div>
      </div>
    </div>
  `;

  const thumbsEl = document.getElementById("rf-thumbs");
  const drawThumbs = () => {
    thumbsEl.innerHTML = keptPhotos.map((u, i) => `
      <span style="position:relative;display:inline-block;">
        <img src="${u}" style="width:80px;height:60px;object-fit:cover;border-radius:8px;display:block;">
        <button type="button" data-i="${i}" aria-label="Remove photo"
          style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:none;background:#FF5252;color:#fff;cursor:pointer;line-height:1;">&times;</button>
      </span>`).join("");
    thumbsEl.querySelectorAll("button").forEach(b => {
      b.onclick = () => { keptPhotos.splice(Number(b.dataset.i), 1); drawThumbs(); };
    });
  };
  drawThumbs();

  document.getElementById("rf-cancel").onclick = () => renderModalContent(ev);
  document.getElementById("rf-save").onclick = () => saveRecap(ev, () => keptPhotos);
}

async function saveRecap(ev, getKeptPhotos) {
  const msg = document.getElementById("rf-msg");
  const saveBtn = document.getElementById("rf-save");
  const show = (cls, text) => { msg.style.display = "block"; msg.className = "form-msg " + cls; msg.textContent = text; };

  const summary = document.getElementById("rf-summary").value.trim();
  const additionalInfo = document.getElementById("rf-extra").value.trim();
  if (!summary) { show("err", "Please write a short summary — it's the only required part."); return; }

  saveBtn.disabled = true;
  show("", "Saving...");
  try {
    // Photos are optional. They're resized/compressed and stored inside the
    // Firestore document (no Cloud Storage), so keep an eye on the 1MB limit.
    const photos = [...getKeptPhotos()];
    for (const file of document.getElementById("rf-photos").files) {
      photos.push(await fileToCompressedDataURL(file, 700, 0.6));
    }

    // Keep any older testimonials/winners already saved on this event.
    const recap = { ...(ev.recap || {}), summary, photos, additionalInfo };

    const approxBytes = JSON.stringify(recap).length + (ev.posterUrl || "").length;
    if (approxBytes > 900000) {
      saveBtn.disabled = false;
      show("err", "Too many or too large photos for one recap (Firestore's 1MB limit per event). Remove a few photos and try again.");
      return;
    }

    await updateDoc(doc(db, "events", ev.id), { recap });
    ev.recap = recap;
    show("ok", "Recap saved!");
    setTimeout(() => renderModalContent(ev), 700);
  } catch (e) {
    console.error(e);
    saveBtn.disabled = false;
    if (e.code === "permission-denied") {
      show("err", "Firestore rejected this save. Check that you're logged in as the organizer who submitted this event, the event date has passed, and the latest firestore.rules is published.");
    } else {
      show("err", "Could not save recap: " + e.message);
    }
  }
}