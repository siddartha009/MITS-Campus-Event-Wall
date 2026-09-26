import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc
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

export const TYPES = ["Fest", "Deadline", "Seminar", "Hackathon", "Camp"];

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
    } catch (e) { console.error("profile load failed", e); }
  }
  renderNavAuthState();
  authReadyResolve();
  });
} else {
  // Firebase never initialized (bad/missing config) — resolve authReady anyway so
  // requireLogin()/requireAdmin() don't hang forever waiting for an auth state
  // that will never arrive.
  authReadyResolve();
}

function renderNavAuthState() {
  const loginLink = document.getElementById("nav-login");
  const registerLink = document.getElementById("nav-register");
  const logoutBtn = document.getElementById("nav-logout");
  const userPill = document.getElementById("nav-user-pill");
  const organizeLink = document.getElementById("nav-organize");
  const adminLink = document.getElementById("nav-admin");

  const loggedIn = !!currentUser;
  if (loginLink) loginLink.style.display = loggedIn ? "none" : "";
  if (registerLink) registerLink.style.display = loggedIn ? "none" : "";
  if (logoutBtn) logoutBtn.style.display = loggedIn ? "" : "none";
  if (userPill) {
    userPill.style.display = loggedIn ? "" : "none";
    userPill.textContent = currentProfile ? currentProfile.name : (currentUser ? currentUser.email : "");
  }
  if (organizeLink) organizeLink.style.display = loggedIn ? "" : "none";
  if (adminLink) adminLink.style.display = (currentProfile && currentProfile.role === "admin") ? "" : "none";

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
