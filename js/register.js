import { auth, db, wirePasswordToggle, DEPARTMENTS, isCollegeEmail, isFacultyEmail } from "./common.js";
import { createUserWithEmailAndPassword, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

wirePasswordToggle("r-password-toggle", "r-password");
wirePasswordToggle("r-password2-toggle", "r-password2");

const deptSel = document.getElementById("r-dept");
DEPARTMENTS.forEach(d => deptSel.insertAdjacentHTML("beforeend", `<option>${d.replace(/&/g, "&amp;")}</option>`));

const roleSel = document.getElementById("r-role");
const emailInput = document.getElementById("r-email");
function syncRole() {
  const faculty = roleSel.value === "faculty";
  emailInput.placeholder = faculty ? "yourname@mits.ac.in" : "ID@mits.ac.in";
  document.getElementById("r-hint").textContent = faculty
    ? "Use your faculty @mits.ac.in mail. After you verify it, your department's HOD approves your account."
    : "Use your 10-character college ID mail. We'll send a verification link to it.";
}
roleSel.addEventListener("change", syncRole);

document.getElementById("r-submit").addEventListener("click", async () => {
  const msg = document.getElementById("r-msg");
  const fail = (t) => { msg.style.display = "block"; msg.className = "form-msg err"; msg.textContent = t; };
  msg.style.display = "block"; msg.className = "form-msg"; msg.textContent = "Creating account...";

  const name = document.getElementById("r-name").value.trim();
  const department = deptSel.value;
  const email = document.getElementById("r-email").value.trim().toLowerCase();
  const password = document.getElementById("r-password").value;
  const password2 = document.getElementById("r-password2").value;

  if (!name || !email || !password) return fail("Name, college mail and password are required.");
  if (!department) return fail("Please choose your department.");
  const faculty = roleSel.value === "faculty";
  if (faculty && !isFacultyEmail(email)) return fail("Use your faculty mail ending in @mits.ac.in.");
  if (!faculty && !isCollegeEmail(email)) return fail("Use your college mail: 10 characters followed by @mits.ac.in (for example ID@mits.ac.in).");
  if (password !== password2) return fail("Passwords do not match.");
  if (password.length < 6) return fail("Password should be at least 6 characters.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Students are identified by their roll number (the 10-character ID in the mail).
    // Faculty start as "pending" until their department's HOD approves them.
    await setDoc(doc(db, "users", cred.user.uid), faculty
      ? { name, department, email, role: "faculty", status: "pending", mailVerified: false }
      : { name, department, email, rollNo: email.split("@")[0].toUpperCase(), role: "student" });
    try { await sendEmailVerification(cred.user); } catch (e) { console.error("verification mail failed", e); }
    msg.className = "form-msg ok";
    msg.textContent = "Account created! Check your college mail for the verification link...";
    setTimeout(() => (window.location.href = "verify.html"), 800);
  } catch (e) {
    if (e.code === "auth/email-already-in-use") fail("That mail already has an account. Try logging in instead.");
    else fail("Sign-up failed: " + e.message);
  }
});
