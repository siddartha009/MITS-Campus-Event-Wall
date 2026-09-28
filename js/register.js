import { auth, db, wirePasswordToggle } from "./common.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

wirePasswordToggle("r-password-toggle", "r-password");
wirePasswordToggle("r-password2-toggle", "r-password2");

document.getElementById("r-submit").addEventListener("click", async () => {
  const msg = document.getElementById("r-msg");
  msg.style.display = "block"; msg.className = "form-msg"; msg.textContent = "Creating account...";

  const name = document.getElementById("r-name").value.trim();
  const rollNo = document.getElementById("r-rollno").value.trim();
  const email = document.getElementById("r-email").value.trim();
  const password = document.getElementById("r-password").value;
  const password2 = document.getElementById("r-password2").value;

  if (!name || !email || !password) {
    msg.className = "form-msg err"; msg.textContent = "Name, email, and password are required.";
    return;
  }
  if (password !== password2) {
    msg.className = "form-msg err"; msg.textContent = "Passwords do not match.";
    return;
  }
  if (password.length < 6) {
    msg.className = "form-msg err"; msg.textContent = "Password should be at least 6 characters.";
    return;
  }

  const role = "organizer"; // admins are promoted manually in the Firestore console

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name, rollNo, email, role
    });
    msg.className = "form-msg ok";
    msg.textContent = "Account created! Redirecting...";
    setTimeout(() => (window.location.href = "index.html"), 600);
  } catch (e) {
    msg.className = "form-msg err"; msg.textContent = "Sign-up failed: " + e.message;
  }
});
