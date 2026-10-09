import { auth, wirePasswordToggle } from "./common.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

wirePasswordToggle("l-password-toggle", "l-password");

document.getElementById("l-submit").addEventListener("click", async () => {
  const msg = document.getElementById("l-msg");
  msg.style.display = "block"; msg.className = "form-msg"; msg.textContent = "Logging in...";
  const email = document.getElementById("l-email").value.trim();
  const password = document.getElementById("l-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    msg.className = "form-msg ok"; msg.textContent = "Logged in! Redirecting...";
    setTimeout(() => (window.location.href = "index.html"), 600);
  } catch (e) {
    const wrong = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"];
    msg.className = "form-msg err";
    msg.textContent = wrong.includes(e.code) ? "Wrong mail or password. Check them and try again." : "Login failed: " + e.message;
  }
});
