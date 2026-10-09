import { db, currentUser, currentProfile, formatDateTime, countdownText, isPast, escapeHtml, fileToCompressedDataURL,
  eventLevel, levelLabel, canParticipate, safeUrl, isAdminProfile, canAccess } from "./common.js";
import { doc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, deleteDoc, getDocs, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let backdropEl = null;

export function openEventModal(ev) {
  closeEventModal();
  backdropEl = document.createElement("div");
  backdropEl.className = "modal-backdrop";
  backdropEl.innerHTML = `<div class="modal" id="modal-inner"></div>`;
  backdropEl.addEventListener("click", (e) => { if (e.target === backdropEl) closeEventModal(); });
  document.addEventListener("keydown", onModalKey);
  document.body.appendChild(backdropEl);
  renderModalContent(ev);
}

function onModalKey(e) {
  // Escape closes the modal, unless the full-size photo viewer is the thing on top
  if (e.key === "Escape" && !lightboxCleanup) closeEventModal();
}

export function closeEventModal() {
  document.removeEventListener("keydown", onModalKey);
  if (backdropEl) { backdropEl.remove(); backdropEl = null; }
}

function interDetailsHtml(ev) {
  const d = ev.interCollege;
  if (eventLevel(ev) !== "inter-college" || !d) return "";
  const rows = [["Host college", d.hostCollege], ["City", d.city], ["Contact", d.contact], ["Entry fee", d.entryFee],
    ["Register by", d.lastRegisterDate], ["Team size", d.teamSize], ["Eligibility", d.eligibility]].filter(([, v]) => v);
  const brochure = safeUrl(d.brochureLink);
  return `<div class="inter-details"><h4>Inter-college details</h4>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>
    ${brochure ? `<a class="btn secondary" href="${brochure}" target="_blank" rel="noopener">Brochure</a>` : ""}</div>`;
}

// ---- Comments (verified students only; the security rules enforce that too) ----
async function loadComments(ev) {
  const box = document.getElementById("modal-comments");
  if (!box) return;
  if (!canAccess()) {
    box.innerHTML = `<h4>Comments</h4><p class="empty-note">${currentUser
      ? "Verified students and faculty can read and post comments."
      : `Log in with your MITS mail to read and post comments. <a href="login.html">Log in</a>`}</p>`;
    return;
  }
  box.innerHTML = `<h4>Comments</h4>
    <div id="cm-list"><p class="empty-note">Loading comments...</p></div>
    <div class="cm-form">
      <textarea id="cm-text" maxlength="300" placeholder="Add a comment (up to 300 characters)"></textarea>
      <button class="btn" id="cm-post">Post comment</button>
    </div>
    <div id="cm-msg" class="form-msg" style="display:none;"></div>`;
  const listEl = box.querySelector("#cm-list");
  const msg = box.querySelector("#cm-msg");
  const col = collection(db, "events", ev.id, "comments");

  try {
    const snap = await getDocs(query(col, orderBy("createdAt", "desc"), limit(50)));
    if (!document.body.contains(box)) return; // modal was closed meanwhile
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    listEl.innerHTML = items.length ? items.map(c => {
      const when = c.createdAt && c.createdAt.toDate ? c.createdAt.toDate().toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
      const mine = currentUser && (currentUser.uid === c.uid || isAdminProfile());
      return `<div class="comment"><strong>${escapeHtml(c.name || "Student")}</strong> <span class="event-meta">${when}</span>
        ${c.rollNo ? `<div class="cm-roll">${escapeHtml(c.rollNo)}</div>` : ""}
        ${mine ? `<button class="cm-del" data-id="${c.id}" aria-label="Delete comment">Delete</button>` : ""}
        <p>${escapeHtml(c.text)}</p></div>`;
    }).join("") : `<p class="empty-note">No comments yet. Be the first to say something.</p>`;
    listEl.querySelectorAll(".cm-del").forEach(b => {
      b.onclick = async () => {
        if (!confirm("Delete this comment?")) return;
        try { await deleteDoc(doc(db, "events", ev.id, "comments", b.dataset.id)); loadComments(ev); }
        catch (e) { console.error(e); }
      };
    });
  } catch (e) {
    console.error("comments load failed", e);
    listEl.innerHTML = `<p class="empty-note">Couldn't load comments right now.</p>`;
  }

  box.querySelector("#cm-post").onclick = async () => {
    const text = box.querySelector("#cm-text").value.trim();
    const show = (cls, t) => { msg.style.display = "block"; msg.className = "form-msg " + cls; msg.textContent = t; };
    if (!text) return show("err", "Write something first.");
    if (!currentUser || !currentProfile) return show("err", "Log in to comment.");
    try {
      // Students show their roll number under their name; faculty and admin show just a name.
      const post = { uid: currentUser.uid, name: currentProfile.name, text, createdAt: serverTimestamp() };
      if (currentProfile.role === "student" && currentProfile.rollNo) post.rollNo = currentProfile.rollNo;
      await addDoc(col, post);
      loadComments(ev);
    } catch (e) {
      console.error(e);
      show("err", e.code === "permission-denied" ? "Only verified MITS students can comment." : "Couldn't post: " + e.message);
    }
  };
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
  const lvl = eventLevel(ev);
  const regUrl = safeUrl(ev.registrationLink);
  const regHtml = !regUrl ? "" : canParticipate(ev)
    ? `<a class="btn reg-link" href="${regUrl}" target="_blank" rel="noopener">Register / Learn more</a>`
    : `<p class="locked-note">🔒 Registration is open to ${escapeHtml(ev.department || "that department")} students only.</p>`;

  inner.innerHTML = `
    <button class="modal-close" id="modal-close-btn" aria-label="Close">&times;</button>
    <div class="modal-top ${ev.posterUrl ? "" : "no-poster"}">
      ${ev.posterUrl ? `<img class="poster-full" src="${ev.posterUrl}" alt="${escapeHtml(ev.title)} poster">` : ""}
      <div class="modal-info">
        <span class="type-badge type-${escapeHtml(ev.type)}">${escapeHtml(ev.type)}</span>
        <h2>${escapeHtml(ev.title)}</h2>
        <div><span class="level-tag level-${lvl}">${escapeHtml(levelLabel(ev))}</span></div>
        <div class="event-meta">${formatDateTime(ev)} · ${escapeHtml(ev.location || "")}</div>
        ${!past ? `<div class="countdown">${countdownText(ev)}</div>` : ""}
        <p style="margin-top:12px;">${escapeHtml(ev.description || "")}</p>
        ${interDetailsHtml(ev)}
        ${regHtml}
        <div class="like-row">
          <span class="heart ${liked ? "liked" : ""}" id="modal-heart">${liked ? "♥" : "♡"}</span>
          <span>${(ev.likedBy || []).length} like${(ev.likedBy || []).length === 1 ? "" : "s"}</span>
          <span class="event-meta" id="like-hint"></span>
        </div>
      </div>
    </div>
    <div class="comments" id="modal-comments"></div>
    <div id="modal-recap-area"></div>
  `;

  document.getElementById("modal-close-btn").onclick = closeEventModal;
  document.getElementById("modal-heart").onclick = () => toggleLike(ev);
  if (!String(ev.id).startsWith("demo-")) loadComments(ev);

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
      ${safeUrl(t.linkedinUrl) ? `<a class="li-btn" href="${safeUrl(t.linkedinUrl)}" target="_blank" rel="noopener" title="LinkedIn">in</a>` : ""}
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
      ${Number.isFinite(r.participants) ? `<p><strong>👥 ${r.participants}</strong> participants</p>` : ""}
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
  if (!canAccess()) {
    const hint = document.getElementById("like-hint");
    if (hint) hint.textContent = currentUser ? "Verified students and faculty can like events." : "Log in with your MITS mail to like events.";
    return;
  }
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

        <label>Participants <span ${hint}>(optional, approx. number who took part — used for the monthly Highlights)</span></label>
        <input type="number" id="rf-participants" min="0" step="1" value="${Number.isFinite(r.participants) ? r.participants : ""}" placeholder="e.g. 120">

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
    const pRaw = document.getElementById("rf-participants").value.trim();
    const participants = pRaw === "" ? null : Math.max(0, Math.round(Number(pRaw)));
    const recap = { ...(ev.recap || {}), summary, photos, additionalInfo };
    if (participants === null || Number.isNaN(participants)) delete recap.participants; else recap.participants = participants;

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