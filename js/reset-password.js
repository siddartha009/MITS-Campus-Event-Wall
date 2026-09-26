import { auth } from "./common.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

document.getElementById("rp-submit").addEventListener("click", async () => {
  const msg = document.getElementById("rp-msg");
  const email = document.getElementById("rp-email").value.trim();

  msg.style.display = "block"; msg.className = "form-msg"; msg.textContent = "Sending...";

  if (!email) {
    msg.className = "form-msg err"; msg.textContent = "Enter your email first.";
    return;
  }

  const showSent = () => {
    msg.className = "form-msg ok";
    msg.textContent = "If that email has an account, a reset link is on its way — check your inbox (and spam folder).";
  };

  try {
    await sendPasswordResetEmail(auth, email);
    showSent();
  } catch (e) {
    // Don't reveal whether an email exists in the system — treat "not found"
    // the same as success from the user's point of view.
    if (e.code === "auth/user-not-found") {
      showSent();
    } else {
      msg.className = "form-msg err";
      msg.textContent = "Couldn't send reset email: " + e.message;
    }
  }
});
