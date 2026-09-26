import { db, storage, currentUser, requireLogin } from "./common.js";
import { collection, addDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const loginMsg = document.getElementById("login-msg");
const formWrap = document.getElementById("form-wrap");

requireLogin(loginMsg).then((ok) => {
  if (ok) formWrap.style.display = "";
  else formWrap.style.display = "none";
});

document.getElementById("f-submit").addEventListener("click", async () => {
  const msg = document.getElementById("f-msg");
  msg.style.display = "block"; msg.className = "form-msg"; msg.textContent = "Submitting...";

  const title = document.getElementById("f-title").value.trim();
  const type = document.getElementById("f-type").value;
  const date = document.getElementById("f-date").value;
  const time = document.getElementById("f-time").value;
  const location = document.getElementById("f-location").value.trim();
  const description = document.getElementById("f-description").value.trim();
  const registrationLink = document.getElementById("f-reglink").value.trim();
  const posterFile = document.getElementById("f-poster").files[0];

  if (!title || !date) {
    msg.className = "form-msg err"; msg.textContent = "Event name and date are required.";
    return;
  }

  try {
    const docRef = await addDoc(collection(db, "events"), {
      organizerId: currentUser.uid,
      title, type, date, time, location, description,
      registrationLink: registrationLink || null,
      posterUrl: "",
      status: "pending",
      likedBy: [],
      recap: { summary: "", photos: [], testimonials: [], winners: [] }
    });

    if (posterFile) {
      const sref = ref(storage, `posters/${docRef.id}_${posterFile.name}`);
      await uploadBytes(sref, posterFile);
      const url = await getDownloadURL(sref);
      await updateDoc(doc(db, "events", docRef.id), { posterUrl: url });
    }

    msg.className = "form-msg ok";
    msg.textContent = "Submitted for approval! You'll see it on the wall once an admin approves it.";
    document.querySelectorAll("#form-wrap input, #form-wrap textarea, #form-wrap select").forEach(el => {
      if (el.type !== "button") el.value = "";
    });
  } catch (e) {
    console.error(e);
    msg.className = "form-msg err"; msg.textContent = "Submission failed: " + e.message;
  }
});
