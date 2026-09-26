# Campus Event Wall — MITS Madanapalle

Plain HTML/CSS/JS frontend backed by Firebase (Auth + Firestore + Storage).

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com → **Add project**.
2. In the project, go to **Build → Authentication → Sign-in method** and enable **Email/Password**.
3. Go to **Build → Firestore Database → Create database** (start in production mode — you'll paste the rules below).
4. Go to **Build → Storage → Get started** (also production mode).
5. Go to **Project settings → General → Your apps → Add app → Web (</>)**, register it, and copy the `firebaseConfig` object it gives you.

## 2. Add your config
Open `js/firebase-config.js` and paste your real values in place of the placeholders.

## 3. Deploy the security rules
Easiest path (no CLI needed): in the Firebase console,
- **Firestore Database → Rules** tab → paste the contents of `firestore.rules` → Publish.
- **Storage → Rules** tab → paste the contents of `storage.rules` → Publish.

(Or, if you have the Firebase CLI: `firebase deploy --only firestore:rules,storage:rules`.)

## 4. Create your admin account
There's no admin sign-up flow on purpose. To make yourself an admin:
1. Register normally on the site (this creates a `users/{uid}` doc with `role: "organizer"`).
2. In the Firebase console → Firestore → `users` collection → open your user doc → change `role` to `admin`.
3. Refresh the site — the "Admin Review" nav link will appear for that account.

## 5. Run it
This is plain static HTML/JS with ES modules, so it needs to be served over `http://` (not opened as a `file://` path) or the module imports will be blocked by the browser. Easiest options:
- VS Code "Live Server" extension → right-click `index.html` → "Open with Live Server", or
- `python3 -m http.server 8000` from this folder, then open `http://localhost:8000`, or
- `firebase deploy --only hosting` if you've set up Firebase Hosting (see below).

### Optional: Firebase Hosting
```
npm install -g firebase-tools
firebase login
firebase init hosting   # pick this project, set public dir to "." , single-page app: No
firebase deploy --only hosting
```

## Demo script (matches the brief's end-to-end flow)
1. **Register** a normal account (defaults to organizer).
2. Go to **Organize Event**, submit an event with a poster image → see "Submitted for approval".
3. Log in as your **admin** account → **Admin Review** → Approve it.
4. Go to **Home** → the event now appears under Upcoming (or Home page, and on the **Calendar**).
5. **Like** the event (heart icon) as any logged-in viewer.
6. To demo the recap flow without waiting a real week: temporarily set that event's `date` field in Firestore to yesterday's date.
7. Log back in as the **organizer** who submitted it → open the event → **Add Recap** → add a summary, photos, testimonials (`Name | Quote | LinkedIn URL` per line) and winners (`Name | Prize` per line) → Save.
8. Recap is now visible to anyone opening that event's detail view, from Home or Calendar.

## Notes on the security rules
The rules in `firestore.rules` implement the spec (public read of approved events, organizer-only pending reads, forced `pending` status on create, admin-only status changes/deletes, self-only `likedBy` toggles, organizer+past-date-only recap writes). Firestore Security Rules can't easily parse a `"YYYY-MM-DD"` date field against "today" in a fully rigorous way — the recap rule does a string comparison against the current date, which is fine for a demo but not bulletproof for edge cases (e.g. time zones right at midnight). For a production version, store event date/time as a Firestore `Timestamp` instead of separate date/time strings and compare against `request.time`.

## File map
- `index.html` / `js/home.js` — Home wall (highlights, upcoming, completed, search/filter, like)
- `calendar.html` / `js/calendar.js` — Month calendar with day drill-down
- `organize.html` / `js/organize.js` — Event submission form
- `admin.html` / `js/admin.js` — Pending-event approval queue
- `login.html`, `register.html` — Firebase Auth email/password
- `js/common.js` — Firebase init, auth-state nav wiring, date/format helpers
- `js/event-detail.js` — Shared event detail modal + recap view/edit (used by Home and Calendar)
- `firestore.rules`, `storage.rules` — security rules to paste into the console
