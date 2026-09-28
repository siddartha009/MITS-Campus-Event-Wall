// Built-in demo events, used ONLY when Firestore returns no approved events
// (or can't be reached). Dates are relative to "today" so the Upcoming /
// Completed / Highlights tabs and the calendar are always populated.
// Once a real approved event exists in Firestore, the demo data disappears.

function poster(title, sub, c1, c2, emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="600" height="800" fill="url(#g)"/>
    <circle cx="500" cy="120" r="90" fill="#fff" opacity=".15"/>
    <circle cx="90" cy="700" r="130" fill="#fff" opacity=".12"/>
    <text x="300" y="370" font-size="130" text-anchor="middle">${emoji}</text>
    <text x="300" y="460" font-size="52" font-weight="800" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif">${title}</text>
    <text x="300" y="520" font-size="28" text-anchor="middle" fill="#fff" opacity=".9" font-family="Arial, sans-serif">${sub}</text>
    <text x="300" y="740" font-size="22" text-anchor="middle" fill="#fff" opacity=".8" font-family="Arial, sans-serif">MITS · Campus Event Wall</text>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Set to true to show sample events whenever Firestore is empty/unreachable.
export const ENABLE_DEMO_FALLBACK = false;

export function getDemoEvents() {
  const u = (n) => Array.from({ length: n }, (_, i) => "demo-user-" + i);
  return [
    { id: "demo-1", title: "Tech Expo 2026", type: "Fest", date: dayOffset(1), time: "10:00",
      location: "Main Auditorium",
      description: "Annual showcase of student projects, robotics demos and startup stalls. Open to all departments.",
      registrationLink: "https://mits.ac.in", likedBy: u(14),
      posterUrl: poster("Tech Expo 2026", "Projects · Robotics · Startups", "#6C5CE7", "#FF6B9D", "🚀") },
    { id: "demo-2", title: "CodeStorm Hackathon", type: "Hackathon", date: dayOffset(2), time: "09:00",
      location: "CS Block, Lab 3",
      description: "24-hour team hackathon. Build something useful for campus life and pitch it to the judges.",
      registrationLink: "https://mits.ac.in", likedBy: u(22),
      posterUrl: poster("CodeStorm", "24-Hour Hackathon", "#2D2A4A", "#8E5CFF", "💻") },
    { id: "demo-3", title: "Project Submission Deadline", type: "Deadline", date: dayOffset(5), time: "23:59",
      location: "Online portal",
      description: "Last date to submit final-year mini-project reports. Late submissions will not be accepted.",
      likedBy: u(3),
      posterUrl: poster("Deadline", "Mini-project reports due", "#FF5252", "#FF9F45", "⏰") },
    { id: "demo-4", title: "AI in Everyday Life — Seminar", type: "Seminar", date: dayOffset(9), time: "14:00",
      location: "Seminar Hall B",
      description: "Guest lecture on practical uses of AI, followed by a Q&A session with industry speakers.",
      registrationLink: "https://mits.ac.in", likedBy: u(8),
      posterUrl: poster("AI Seminar", "Guest lecture + Q&A", "#3DA8F5", "#00CEC9", "🤖") },
    { id: "demo-5", title: "Blood Donation Camp", type: "Camp", date: dayOffset(14), time: "09:30",
      location: "College Quadrangle",
      description: "Donate blood and save lives. Organised with the local Red Cross unit. Refreshments provided.",
      likedBy: u(11),
      posterUrl: poster("Blood Donation", "Give blood, save lives", "#2ECC71", "#00B894", "❤️") },
    { id: "demo-6", title: "Spark Cultural Fest", type: "Fest", date: dayOffset(21), time: "17:00",
      location: "Open Air Theatre",
      description: "Music, dance and drama performances by students from every department.",
      likedBy: u(6),
      posterUrl: poster("Spark Fest", "Music · Dance · Drama", "#FF6B9D", "#FFC93C", "🎶") },
    { id: "demo-7", title: "Web Dev Bootcamp Seminar", type: "Seminar", date: dayOffset(-3), time: "11:00",
      location: "IT Block, Room 204",
      description: "Hands-on introduction to building and deploying a website from scratch.",
      likedBy: u(9),
      posterUrl: poster("Web Dev Bootcamp", "Build and deploy in a day", "#3DA8F5", "#6C5CE7", "🌐"),
      recap: {
        summary: "Over 80 students attended and deployed their first website by the end of the day. Great energy and lots of questions!",
        photos: [], winners: [],
        testimonials: [{ name: "Ananya R.", quote: "Finally understood how hosting actually works!", linkedinUrl: "" }]
      } },
    { id: "demo-8", title: "Inter-Department Quiz", type: "Fest", date: dayOffset(-9), time: "15:00",
      location: "Main Auditorium",
      description: "Fast-paced quiz contest with teams from every department.",
      likedBy: u(5),
      posterUrl: poster("Quiz Night", "Inter-department contest", "#FFC93C", "#FF9F45", "🧠"),
      recap: {
        summary: "Eight teams competed over three rounds. Computer Science edged out Mechanical in a tie-breaker.",
        photos: [], testimonials: [],
        winners: [{ name: "Team Bytes (CSE)", prize: "1st Place", photoUrl: "" },
                  { name: "Team Gears (ME)", prize: "2nd Place", photoUrl: "" }]
      } },
    { id: "demo-9", title: "Robotics Workshop", type: "Camp", date: dayOffset(-20), time: "10:00",
      location: "Robotics Lab",
      description: "Two-day workshop on building line-following robots using Arduino.",
      likedBy: u(4),
      posterUrl: poster("Robotics Workshop", "Arduino · Line follower", "#8E5CFF", "#3DA8F5", "🤖") }
  ].map(e => ({ organizerId: "demo", status: "approved", recap: { summary: "", photos: [], testimonials: [], winners: [] }, ...e }));
}

export function showDemoBanner() {
  if (document.getElementById("demo-banner")) return;
  const b = document.createElement("div");
  b.id = "demo-banner";
  b.textContent = "Demo mode — showing sample events. Real approved events replace these automatically.";
  b.style.cssText = "background:#FFC93C;color:#2D2A4A;text-align:center;padding:8px 12px;font-weight:800;font-size:.85em;";
  const nav = document.querySelector(".navbar");
  if (nav) nav.insertAdjacentElement("afterend", b);
}
