import { db, currentUser, currentProfile, requireLogin, canAccess, fileToCompressedDataURL, DEPARTMENTS, TYPES, safeUrl } from "./common.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const loginMsg = document.getElementById("login-msg");
const formWrap = document.getElementById("form-wrap");
const $ = (id) => document.getElementById(id);

requireLogin(loginMsg).then((ok) => {
  if (ok && !canAccess()) {
    loginMsg.textContent = "Verify your MITS mail before organizing events. Redirecting...";
    setTimeout(() => (window.location.href = "verify.html"), 1200);
    ok = false;
  }
  formWrap.style.display = ok ? "" : "none";
  if (ok && currentProfile && currentProfile.department) $("f-dept").value = currentProfile.department;
});

TYPES.forEach(t => { const o = document.createElement("option"); o.textContent = t; $("f-type").appendChild(o); });
DEPARTMENTS.forEach(d => { const o = document.createElement("option"); o.textContent = d; $("f-dept").appendChild(o); });

function syncLevel() {
  const level = $("f-level").value;
  $("f-dept-wrap").style.display = level === "department" ? "" : "none";
  $("f-inter-wrap").style.display = level === "inter-college" ? "" : "none";
}
$("f-level").addEventListener("change", syncLevel);

$("f-submit").addEventListener("click", async () => {
  const msg = $("f-msg");
  const btn = $("f-submit");
  const fail = (t) => { msg.style.display = "block"; msg.className = "form-msg err"; msg.textContent = t; };
  msg.style.display = "block"; msg.className = "form-msg"; msg.textContent = "Submitting...";

  const title = $("f-title").value.trim();
  const type = $("f-type").value;
  const level = $("f-level").value;
  const date = $("f-date").value;
  const time = $("f-time").value;
  const location = $("f-location").value.trim();
  const description = $("f-description").value.trim();
  const regRaw = $("f-reglink").value.trim();
  const posterFile = $("f-poster").files[0];

  if (!title || !date) return fail("Event name and date are required.");
  if (regRaw && !safeUrl(regRaw)) return fail("The registration link must start with http:// or https://");

  let department = null;
  let interCollege = null;
  if (level === "department") {
    department = $("f-dept").value;
    if (!department) return fail("Choose which department this event is for.");
  }
  if (level === "inter-college") {
    const hostCollege = $("f-ic-college").value.trim();
    const city = $("f-ic-city").value.trim();
    const contact = $("f-ic-contact").value.trim();
    const brochureRaw = $("f-ic-brochure").value.trim();
    if (!hostCollege || !city || !contact) return fail("For inter-college events, the host college, city and a contact are required.");
    if (brochureRaw && !safeUrl(brochureRaw)) return fail("The brochure link must start with http:// or https://");
    interCollege = {
      hostCollege, city, contact,
      entryFee: $("f-ic-fee").value.trim(),
      lastRegisterDate: $("f-ic-last").value,
      teamSize: $("f-ic-team").value.trim(),
      eligibility: $("f-ic-elig").value.trim(),
      brochureLink: safeUrl(brochureRaw)
    };
  }

  btn.disabled = true;
  try {
    const posterUrl = posterFile ? await fileToCompressedDataURL(posterFile) : "";
    await addDoc(collection(db, "events"), {
      organizerId: currentUser.uid,
      title, type, level, department, interCollege,
      date, time, location, description,
      registrationLink: regRaw ? safeUrl(regRaw) : null,
      posterUrl,
      status: "pending",
      likedBy: [],
      recap: { summary: "", photos: [], testimonials: [], winners: [] }
    });

    msg.className = "form-msg ok";
    msg.textContent = "Submitted for approval! You'll see it on the wall once an admin approves it.";
    document.querySelectorAll("#form-wrap input, #form-wrap textarea").forEach(el => { el.value = ""; });
    document.querySelectorAll("#form-wrap select").forEach(el => { el.selectedIndex = 0; });
    if (currentProfile && currentProfile.department) $("f-dept").value = currentProfile.department;
    syncLevel();
  } catch (e) {
    console.error(e);
    fail("Submission failed: " + e.message);
  } finally {
    btn.disabled = false;
  }
});
