import { auth } from "./common.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

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
    msg.className = "form-msg err"; msg.textContent = "Login failed: " + e.message;
  }
});
