import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

function showConfigError(message) {
  // Runs even if the rest of the app can't, so a bad Firebase config never
  // just silently leaves the page blank with no clue why.
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:9999;background:#8a1c1c;color:#fff;" +
    "font-family:sans-serif;padding:10px 16px;font-size:.9em;text-align:center;";
  banner.textContent = message;
  document.addEventListener("DOMContentLoaded", () => document.body.prepend(banner));
  if (document.body) document.body.prepend(banner);
}

let app, authInstance, dbInstance;
try {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_")) {
    throw new Error("firebase-config.js still has placeholder values");
  }
  app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
} catch (e) {
  console.error("Firebase init failed:", e);
  showConfigError(
    "Firebase isn't configured yet — edit js/firebase-config.js with your real project values (see README). " +
    "Event data won't load until this is fixed."
  );
}
export const auth = authInstance;
export const db = dbInstance;

// Images are stored as compressed base64 data URLs directly inside Firestore
// documents (no Cloud Storage / Blaze plan required). Resizes to maxDim on the
// longest side and re-encodes as JPEG at the given quality so a typical photo
// lands well under Firestore's 1MB-per-document limit.
export function fileToCompressedDataURL(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => { img.src = reader.result; };
    img.onerror = () => reject(new Error("Could not decode image"));
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
      else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    reader.readAsDataURL(file);
  });
}

// Event categories. Keep in sync with the type list in firestore.rules and the colours in css/style.css + js/calendar.js.
export const TYPES = ["Fest", "Cultural", "Sports", "Hackathon", "Workshop", "Seminar", "Competition", "Club", "Career", "Camp", "Deadline", "Other"];

// current logged-in profile (uid, name, rollNo, email, role) — populated after auth resolves
export let currentUser = null;
export let currentProfile = null;
let authReadyResolve;
export const authReady = new Promise(res => (authReadyResolve = res));

if (auth) {
  onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentProfile = null;
  if (user) {
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) currentProfile = { uid: user.uid, ...snap.data() };
      // Faculty: once their mail is verified, flag it so the HOD's approval list shows them.
      // (The rules only allow this flag to flip when the sign-in token says the mail is verified.)
      if (currentProfile && ["faculty", "hod"].includes(currentProfile.role) && !currentProfile.mailVerified && user.emailVerified) {
        updateDoc(doc(db, "users", user.uid), { mailVerified: true })
          .then(() => { currentProfile.mailVerified = true; }).catch(() => {});
      }
    } catch (e) { console.error("profile load failed", e); }
  }
  renderNavAuthState();
  authReadyResolve();
  });
} else {
  // Firebase never initialized (bad/missing config) — resolve authReady anyway so
  // requireLogin()/requireAdmin() don't hang forever waiting for an auth state
  // that will never arrive.
  renderNavAuthState();
  authReadyResolve();
}

function renderNavAuthState() {
  const loginLink = document.getElementById("nav-login");
  const registerLink = document.getElementById("nav-register");
  const logoutBtn = document.getElementById("nav-logout");
  const userPill = document.getElementById("nav-user-pill");
  const organizeLink = document.getElementById("nav-organize");
  const adminLink = document.getElementById("nav-admin");
  const pollsLink = document.getElementById("nav-polls");
  const approvalsLink = document.getElementById("nav-approvals");

  const loggedIn = !!currentUser;
  if (loginLink) loginLink.style.display = loggedIn ? "none" : "";
  if (registerLink) registerLink.style.display = loggedIn ? "none" : "";
  if (logoutBtn) logoutBtn.style.display = loggedIn ? "" : "none";
  if (userPill) {
    userPill.style.display = loggedIn ? "" : "none";
    userPill.textContent = currentProfile ? currentProfile.name : (currentUser ? currentUser.email : "");
  }
  if (organizeLink) organizeLink.style.display = canAccess() ? "" : "none";
  if (adminLink) adminLink.style.display = (currentProfile && currentProfile.role === "admin") ? "" : "none";
  if (pollsLink) pollsLink.style.display = (canAccess() || isAdminProfile()) ? "" : "none";
  if (approvalsLink) approvalsLink.style.display = (isAdminProfile() || isHodProfile()) ? "" : "none";
  renderStatusBanner();

  if (logoutBtn) logoutBtn.onclick = () => signOut(auth);
}

export function requireLogin(redirectMsgEl) {
  return authReady.then(() => {
    if (!currentUser) {
      if (redirectMsgEl) redirectMsgEl.textContent = "Please log in first — redirecting to login...";
      setTimeout(() => (window.location.href = "login.html"), 1200);
      return false;
    }
    return true;
  });
}

export function requireAdmin(msgEl) {
  return authReady.then(() => {
    if (!currentUser || !currentProfile || currentProfile.role !== "admin") {
      if (msgEl) msgEl.textContent = "Admins only. Redirecting home...";
      setTimeout(() => (window.location.href = "index.html"), 1200);
      return false;
    }
    return true;
  });
}

// ---- date helpers ----
export function toDate(ev) {
  // event.date is "YYYY-MM-DD", event.time is "HH:MM" (optional)
  const t = ev.time || "00:00";
  return new Date(`${ev.date}T${t}:00`);
}

export function isUpcoming(ev) {
  const now = new Date();
  const in1Month = new Date();
  in1Month.setMonth(in1Month.getMonth() + 1);
  const d = toDate(ev);
  return d >= now && d <= in1Month;
}

export function isRecentlyCompleted(ev) {
  const now = new Date();
  const back1Month = new Date();
  back1Month.setMonth(back1Month.getMonth() - 1);
  const d = toDate(ev);
  return d < now && d >= back1Month;
}

export function isPast(ev) {
  return toDate(ev) < new Date();
}

export function isInCurrentCalendarMonth(ev) {
  const d = toDate(ev);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function formatDateTime(ev) {
  const d = toDate(ev);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
    (ev.time ? " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");
}

export function countdownText(ev) {
  const diff = toDate(ev).getTime() - Date.now();
  if (diff <= 0) return "Happening now / started";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

// Wires a "Show/Hide" button next to a password input. Call once per
// password field on pages that have one.
export function wirePasswordToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.textContent = showing ? "Show" : "Hide";
  });
}


// ---- college identity, verification and event levels ----
// Edit this list to match your departments. It is only used by the UI
// (registration dropdown, organizer form, Home filter) — the rules don't need it.
export const DEPARTMENTS = [
  "CSE", "CSE (AI & ML)", "CSE (Data Science)", "CSE (Cyber Security)", "IT",
  "ECE", "EEE", "Mechanical", "Civil", "MBA", "MCA", "Basic Sciences & Humanities"
];

// 10 letters/digits followed by @mits.ac.in. Keep in sync with hasCollegeEmail() in firestore.rules.
export const COLLEGE_EMAIL_RE = /^[a-z0-9]{10}@mits\.ac\.in$/i;
export function isCollegeEmail(email) {
  return COLLEGE_EMAIL_RE.test((email || "").trim());
}

// Faculty use any @mits.ac.in address (not the 10-character student ID). Keep in sync with hasFacultyEmail() in firestore.rules.
export const FACULTY_EMAIL_RE = /^[a-z0-9._-]{2,40}@mits\.ac\.in$/i;
export function isFacultyEmail(email) {
  return FACULTY_EMAIL_RE.test((email || "").trim());
}

export function isAdminProfile() {
  return !!currentProfile && currentProfile.role === "admin";
}
export function isHodProfile() {
  return !!currentProfile && currentProfile.role === "hod" && currentProfile.status === "approved";
}

// May like, comment, vote and organize: admin, verified students, and verified faculty
// that their HOD has approved. (Viewing events is open to everyone.)
export function canAccess() {
  if (!currentUser) return false;
  if (isAdminProfile()) return true;
  if (!currentUser.emailVerified || !currentProfile) return false;
  if (currentProfile.role === "faculty" || currentProfile.role === "hod") return currentProfile.status === "approved";
  return true; // students
}

function renderStatusBanner() {
  const old = document.getElementById("status-banner");
  if (old) old.remove();
  if (!currentUser || isAdminProfile() || canAccess() || /verify\.html$/.test(location.pathname)) return;
  let html = "";
  if (!currentUser.emailVerified) html = `Verify your mail to like, comment and vote. <a href="verify.html">Verify now</a>`;
  else if (currentProfile && currentProfile.status === "pending") html = "Your faculty account is waiting for your HOD's approval. You can browse the wall now; liking, commenting and voting unlock once you're approved.";
  else if (currentProfile && currentProfile.status === "rejected") html = "Your faculty request wasn't approved. Please contact your department's HOD.";
  if (!html) return;
  const bar = document.createElement("div");
  bar.id = "status-banner"; bar.className = "status-banner"; bar.innerHTML = html;
  const nav = document.querySelector(".navbar");
  if (nav) nav.insertAdjacentElement("afterend", bar);
}

export function eventLevel(ev) {
  return ev.level || "college"; // events created before levels existed count as college-wide
}

export function levelLabel(ev) {
  const l = eventLevel(ev);
  if (l === "department") return (ev.department || "Department") + " only";
  if (l === "inter-college") {
    const host = ev.interCollege && ev.interCollege.hostCollege;
    return "Inter-college" + (host ? " · " + host : "");
  }
  return "College-wide";
}

// Department events are visible to everyone signed in, but only that department participates.
export function canParticipate(ev) {
  if (eventLevel(ev) !== "department") return true;
  if (!currentUser) return false;
  if (currentUser.uid === ev.organizerId || isAdminProfile()) return true;
  return !!currentProfile && currentProfile.department === ev.department;
}

// Only http(s) links are allowed through; anything else (javascript:, data:) becomes "".
export function safeUrl(u) {
  try {
    const x = new URL(String(u || "").trim());
    return (x.protocol === "https:" || x.protocol === "http:") ? x.href : "";
  } catch { return ""; }
}

// Call at the top of a members-only page (polls). Resolves true when the visitor may use it;
// otherwise swaps the page content for a prompt that says what's missing.
export function gateAccess() {
  return authReady.then(() => {
    if (canAccess()) return true;
    const page = document.querySelector(".page");
    if (page) {
      [...page.children].forEach(el => { if (!el.matches("h1.page-title")) el.style.display = "none"; });
      let inner;
      if (!currentUser) inner = `<h2>Log in with your college mail</h2>
        <p>This page is for verified MITS students and faculty. Log in with your @mits.ac.in mail to continue.</p>
        <a class="btn" href="login.html">Log in</a> <a class="btn secondary" href="register.html">Create account</a>`;
      else if (!currentUser.emailVerified) inner = `<h2>Verify your MITS mail</h2>
        <p>We sent a verification link to <strong>${escapeHtml(currentUser.email)}</strong>. Open it, then come back here.</p>
        <a class="btn" href="verify.html">Verify now</a>`;
      else inner = `<h2>Waiting for approval</h2>
        <p>${currentProfile && currentProfile.status === "rejected" ? "Your faculty request wasn't approved. Please contact your department's HOD." : "Your HOD hasn't approved your faculty account yet. This page opens once they do."}</p>
        <a class="btn secondary" href="index.html">Back to the wall</a>`;
      const box = document.createElement("div");
      box.className = "note gate";
      box.innerHTML = inner;
      page.appendChild(box);
    }
    return false;
  });
}
