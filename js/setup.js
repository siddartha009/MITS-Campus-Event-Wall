import { auth, db, wirePasswordToggle } from "./common.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Must match the email list in isAdminEmail() inside firestore.rules
const ADMIN_EMAIL = "admin@mits.demo";
const ACCOUNTS = [
  { name: "Admin",      rollNo: "ADMIN", email: ADMIN_EMAIL,        role: "admin" },
  { name: "Organizer 1", rollNo: "MITS001", email: "user1@mits.demo", role: "organizer" },
  { name: "Organizer 2", rollNo: "MITS002", email: "user2@mits.demo", role: "organizer" },
  { name: "Organizer 3", rollNo: "MITS003", email: "user3@mits.demo", role: "organizer" }
];

document.getElementById("acct-list").innerHTML =
  ACCOUNTS.map(a => `<li><strong>${a.email}</strong> — ${a.role}</li>`).join("");
wirePasswordToggle("s-toggle", "s-password");

const log = (html) => { document.getElementById("s-log").insertAdjacentHTML("beforeend", html + "<br>"); };

document.getElementById("s-run").addEventListener("click", async () => {
  const password = document.getElementById("s-password").value;
  document.getElementById("s-log").innerHTML = "";
  if (password.length < 6) { log("❌ Password must be at least 6 characters."); return; }

  for (const a of ACCOUNTS) {
    try {
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, a.email, password);
      } catch (e) {
        if (e.code === "auth/email-already-in-use") cred = await signInWithEmailAndPassword(auth, a.email, password);
        else throw e;
      }
      const ref = doc(db, "users", cred.user.uid);
      if (!(await getDoc(ref)).exists()) {
        await setDoc(ref, { name: a.name, rollNo: a.rollNo, email: a.email, role: a.role });
      }
      log(`✅ ${a.email} ready (${a.role})`);
    } catch (e) {
      log(`❌ ${a.email}: ${e.code || e.message}`);
    }
  }
  await signOut(auth);
  log("<strong>Done.</strong> Now log in at login.html. Delete setup.html + js/setup.js when finished.");
});
