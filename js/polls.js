import { db, currentUser, currentProfile, gateAccess, isAdminProfile, DEPARTMENTS, escapeHtml } from "./common.js";
import {
  collection, query, where, getDocs, getDoc, doc, writeBatch, updateDoc, serverTimestamp, increment, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const fmt = (ms) => new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

gateAccess().then(ok => { if (ok) { if (isAdminProfile()) renderCreateForm(); loadPolls(); } });

// ---------- admin: create a poll ----------
function renderCreateForm() {
  const box = $("admin-poll-box");
  box.innerHTML = `
    <div class="note form-box" style="max-width:640px;margin:10px 0 34px;">
      <h2 style="margin:0 0 4px;">Create a poll</h2>
      <label>Question</label>
      <input id="pc-q" type="text" maxlength="200" placeholder="e.g. Which event should we host next?">
      <label>Options (one per line, 2 to 10)</label>
      <textarea id="pc-opts" placeholder="Hackathon&#10;Cultural night&#10;Sports meet"></textarea>
      <label>Who is it for?</label>
      <select id="pc-scope">
        <option value="college">Whole college (every department)</option>
        <option value="department">One department</option>
      </select>
      <div id="pc-dept-wrap" style="display:none;"><label>Department</label><select id="pc-dept"></select></div>
      <label><input id="pc-multi" type="checkbox" style="width:auto;margin-right:8px;">Let voters pick more than one option</label>
      <label><input id="pc-live" type="checkbox" checked style="width:auto;margin-right:8px;">Show live results while voting is open</label>
      <p class="field-hint">Untick this for suspense: results stay hidden from everyone but you until voting ends.</p>
      <label>Voting period</label>
      <select id="pc-end">
        <option value="manual">Until I close it</option>
        <option value="timed">Ends at a date and time</option>
      </select>
      <input id="pc-endat" type="datetime-local" style="display:none;margin-top:8px;">
      <button class="btn" id="pc-submit" style="margin-top:18px;">Publish poll</button>
      <div id="pc-msg" class="form-msg" style="display:none;"></div>
    </div>`;
  DEPARTMENTS.forEach(d => { const o = document.createElement("option"); o.textContent = d; $("pc-dept").appendChild(o); });
  $("pc-dept").value = (currentProfile && currentProfile.department) || DEPARTMENTS[0];
  $("pc-scope").onchange = () => { $("pc-dept-wrap").style.display = $("pc-scope").value === "department" ? "" : "none"; };
  $("pc-end").onchange = () => { $("pc-endat").style.display = $("pc-end").value === "timed" ? "" : "none"; };

  $("pc-submit").onclick = async () => {
    const msg = $("pc-msg");
    const fail = (t) => { msg.style.display = "block"; msg.className = "form-msg err"; msg.textContent = t; };
    const question = $("pc-q").value.trim();
    const options = [...new Set($("pc-opts").value.split("\n").map(s => s.trim()).filter(Boolean))];
    const scope = $("pc-scope").value;
    let endsAt = null;
    if (question.length < 3) return fail("Write the question first.");
    if (options.length < 2 || options.length > 10) return fail("Give between 2 and 10 different options, one per line.");
    if ($("pc-end").value === "timed") {
      const d = new Date($("pc-endat").value);
      if (isNaN(d) || d.getTime() <= Date.now() + 60000) return fail("Pick an end time in the future.");
      endsAt = Timestamp.fromDate(d);
    }
    $("pc-submit").disabled = true;
    try {
      const pollRef = doc(collection(db, "polls"));
      const batch = writeBatch(db);
      batch.set(pollRef, {
        question, options, scope,
        department: scope === "department" ? $("pc-dept").value : null,
        multi: $("pc-multi").checked, showLive: $("pc-live").checked,
        endsAt, closedAt: null,
        createdBy: currentUser.uid, createdAt: serverTimestamp()
      });
      const zeros = {}; for (let i = 0; i < 10; i++) zeros["c" + i] = 0;
      batch.set(doc(db, "polls", pollRef.id, "tally", "counts"), zeros);
      await batch.commit();
      msg.style.display = "block"; msg.className = "form-msg ok"; msg.textContent = "Poll published.";
      $("pc-q").value = ""; $("pc-opts").value = "";
      loadPolls();
    } catch (e) { console.error(e); fail("Couldn't publish: " + e.message); }
    $("pc-submit").disabled = false;
  };
}

// ---------- load and show polls ----------
async function loadPolls() {
  const listEl = $("poll-list");
  listEl.innerHTML = `<p class="empty-note">Loading polls...</p>`;
  try {
    const col = collection(db, "polls");
    // two simple queries (college-wide + my department) so the security rules can verify each one
    const snaps = isAdminProfile() ? [await getDocs(col)] : [
      await getDocs(query(col, where("scope", "==", "college"))),
      ...(currentProfile && currentProfile.department
        ? [await getDocs(query(col, where("scope", "==", "department"), where("department", "==", currentProfile.department)))]
        : [])
    ];
    const polls = snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
    polls.sort((a, b) => (b.createdAt ? b.createdAt.toMillis() : 0) - (a.createdAt ? a.createdAt.toMillis() : 0));

    await Promise.all(polls.map(async (p) => {
      p.myVote = null; p.tally = null;
      try {
        const v = await getDoc(doc(db, "polls", p.id, "votes", currentUser.uid));
        if (v.exists()) p.myVote = v.data().choices;
      } catch (e) { /* no vote */ }
      try {
        const t = await getDoc(doc(db, "polls", p.id, "tally", "counts"));
        if (t.exists()) p.tally = t.data();
      } catch (e) { /* hidden until the poll ends (suspense) */ }
    }));

    if (!polls.length) { listEl.innerHTML = `<p class="empty-note">No polls right now. Check back soon.</p>`; return; }
    const open = polls.filter(p => !isEnded(p));
    const done = polls.filter(isEnded);
    listEl.innerHTML =
      (open.length ? `<h2 class="section-title">Open for voting</h2><div class="poll-grid">${open.map(pollHtml).join("")}</div>` : "") +
      (done.length ? `<h2 class="section-title">Finished</h2><div class="poll-grid">${done.map(pollHtml).join("")}</div>` : "");
    polls.forEach(wirePoll);
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<p class="empty-note">Couldn't load polls: ${escapeHtml(e.message)}</p>`;
  }
}

function isEnded(p) {
  return !!p.closedAt || (p.endsAt && Date.now() >= p.endsAt.toMillis());
}

function pollHtml(p) {
  const ended = isEnded(p);
  const admin = isAdminProfile();
  const scope = p.scope === "department" ? (p.department + " only") : "Whole college";
  const status = ended ? "Voting has ended" : p.endsAt ? "Ends " + fmt(p.endsAt.toMillis()) : "Open until the admin closes it";
  const counts = p.tally ? p.options.map((_, i) => p.tally["c" + i] || 0) : null;
  const total = counts ? counts.reduce((a, b) => a + b, 0) : 0;
  const canVote = !ended && !admin && !p.myVote;

  let body;
  if (canVote) {
    body = p.options.map((o, i) => `<label class="poll-opt"><input type="${p.multi ? "checkbox" : "radio"}" name="opt-${p.id}" value="${i}"> ${escapeHtml(o)}</label>`).join("") +
      `<button class="btn poll-vote" style="margin-top:10px;">Vote</button><span class="event-meta poll-msg"></span>` +
      (p.multi ? `<div class="field-hint">You can pick more than one. Votes are final once cast.</div>` : `<div class="field-hint">Votes are final once cast.</div>`);
  } else if (counts) {
    body = p.options.map((o, i) => {
      const pct = total ? Math.round(counts[i] * 100 / total) : 0;
      const mine = p.myVote && p.myVote.includes(i);
      return `<div class="poll-res${mine ? " mine" : ""}"><div class="poll-res-top"><span>${escapeHtml(o)}${mine ? " ✓" : ""}</span><span>${counts[i]} (${pct}%)</span></div>
        <div class="poll-bar"><span style="width:${pct}%"></span></div></div>`;
    }).join("") + `<div class="field-hint">${total} vote${total === 1 ? "" : "s"} counted${p.multi ? " (people could pick several options)" : ""}.</div>`;
  } else {
    body = `<p class="poll-note">${p.myVote ? "✓ Your vote is in. " : ""}Results appear when voting ends.</p>`;
  }
  if (admin && !ended && counts) body = `<div class="field-hint">Only you can see these live totals${p.showLive ? "" : " (hidden from voters until the poll ends)"}.</div>` + body;

  const adminBtns = admin ? `<div class="poll-admin">
      ${!ended ? `<button class="btn secondary poll-close">Close now</button>` : ""}
      <button class="btn secondary poll-live">${p.showLive ? "Hide live results" : "Show live results"}</button>
      <button class="btn danger poll-del">Delete</button></div>` : "";

  return `<div class="note poll-card" data-id="${p.id}">
    <span class="level-tag ${p.scope === "department" ? "level-department" : ""}">${escapeHtml(scope)}</span>
    <h3>${escapeHtml(p.question)}</h3>
    <div class="event-meta">${status}${p.multi ? " · pick one or more" : ""}</div>
    <div style="margin-top:10px;">${body}</div>${adminBtns}</div>`;
}

function wirePoll(p) {
  const card = document.querySelector(`.poll-card[data-id="${p.id}"]`);
  if (!card) return;
  const say = (t) => { const m = card.querySelector(".poll-msg"); if (m) m.textContent = " " + t; };

  const voteBtn = card.querySelector(".poll-vote");
  if (voteBtn) voteBtn.onclick = async () => {
    const chosen = [...card.querySelectorAll("input:checked")].map(i => Number(i.value));
    if (!chosen.length) return say("Pick an option first.");
    voteBtn.disabled = true;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "polls", p.id, "votes", currentUser.uid), { choices: chosen, at: serverTimestamp() });
      const bump = {}; chosen.forEach(i => { bump["c" + i] = increment(1); });
      batch.update(doc(db, "polls", p.id, "tally", "counts"), bump);
      await batch.commit();
      loadPolls();
    } catch (e) {
      console.error(e); voteBtn.disabled = false;
      say(e.code === "permission-denied" ? "Couldn't record your vote. The poll may have ended, or you may have voted already." : e.message);
    }
  };

  const closeBtn = card.querySelector(".poll-close");
  if (closeBtn) closeBtn.onclick = async () => {
    if (!confirm("Close this poll now? Voting stops and results become visible to everyone.")) return;
    await updateDoc(doc(db, "polls", p.id), { closedAt: serverTimestamp() }); loadPolls();
  };
  const liveBtn = card.querySelector(".poll-live");
  if (liveBtn) liveBtn.onclick = async () => { await updateDoc(doc(db, "polls", p.id), { showLive: !p.showLive }); loadPolls(); };
  const delBtn = card.querySelector(".poll-del");
  if (delBtn) delBtn.onclick = async () => {
    if (!confirm("Delete this poll and all its votes? This can't be undone.")) return;
    try {
      const votes = await getDocs(collection(db, "polls", p.id, "votes"));
      const refs = [...votes.docs.map(d => d.ref), doc(db, "polls", p.id, "tally", "counts"), doc(db, "polls", p.id)];
      for (let i = 0; i < refs.length; i += 400) {
        const b = writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit();
      }
      loadPolls();
    } catch (e) { console.error(e); alert("Couldn't delete: " + e.message); }
  };
}
