import { auth, db, authReady, currentUser, currentProfile, isAdminProfile } from "./common.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { sendEmailVerification, reload, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const msg = document.getElementById("v-msg");
const say = (cls, text) => { msg.style.display = "block"; msg.className = "form-msg " + cls; msg.textContent = text; };

authReady.then(() => {
  if (!currentUser) { window.location.href = "login.html"; return; }
  if (currentUser.emailVerified || isAdminProfile()) { window.location.href = "index.html"; return; }
  document.getElementById("v-email").textContent = currentUser.email;
});

document.getElementById("v-check").onclick = async () => {
  say("", "Checking...");
  try {
    await reload(auth.currentUser);
    // The security rules read the verified flag from the sign-in token, so refresh it too.
    await auth.currentUser.getIdToken(true);
    if (auth.currentUser.emailVerified) {
      // faculty: tell the HOD's approval list that the mail is now verified
      if (currentProfile && ["faculty", "hod"].includes(currentProfile.role)) {
        try { await updateDoc(doc(db, "users", auth.currentUser.uid), { mailVerified: true }); } catch (e) { console.error(e); }
      }
      say("ok", "Verified! Taking you to the wall...");
      setTimeout(() => (window.location.href = "index.html"), 700);
    } else {
      say("err", "Not verified yet. Open the link in the mail first, then press this button again.");
    }
  } catch (e) { say("err", "Couldn't check: " + e.message); }
};

const resend = document.getElementById("v-resend");
resend.onclick = async () => {
  resend.disabled = true;
  try {
    await sendEmailVerification(auth.currentUser);
    say("ok", "Sent again. It can take a few minutes to arrive.");
    let left = 60;
    const t = setInterval(() => {
      resend.textContent = `Resend in ${--left}s`;
      if (left <= 0) { clearInterval(t); resend.textContent = "Resend mail"; resend.disabled = false; }
    }, 1000);
  } catch (e) {
    resend.disabled = false;
    say("err", e.code === "auth/too-many-requests" ? "Too many requests. Wait a few minutes and try again." : "Couldn't send: " + e.message);
  }
};

document.getElementById("v-switch").onclick = () => signOut(auth).then(() => (window.location.href = "login.html"));
