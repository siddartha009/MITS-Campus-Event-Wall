# Campus Event Wall — MITS Madanapalle

Plain HTML/CSS/JS frontend backed by Firebase (Auth + Firestore only — no Cloud Storage, see note below).

## Why no Firebase Storage
As of Feb 2026, Firebase requires the paid **Blaze** plan (a linked billing card) just to use Cloud Storage, even if usage stays free. To avoid that, this project skips Storage entirely: poster and recap photos are compressed client-side and stored as base64 image data directly inside the Firestore document. Firestore itself stays fully free on the no-card **Spark** plan. The trade-off is Firestore's 1MB-per-document limit, so images are auto-resized/compressed on upload (poster ~900px, recap/winner photos smaller) and the recap form warns you before saving if a document would exceed that limit.

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com → **Add project**.
2. In the project, go to **Build → Authentication → Sign-in method** and enable **Email/Password**.
3. Go to **Build → Firestore Database → Create database** (start in production mode — you'll paste the rules below).
4. Go to **Project settings → General → Your apps → Add app → Web (</>)**, register it, and copy the `firebaseConfig` object it gives you.

## 2. Add your config
Open `js/firebase-config.js` and paste your real values in place of the placeholders.

## 3. Deploy the security rules
Easiest path (no CLI needed): in the Firebase console, **Firestore Database → Rules** tab → paste the contents of `firestore.rules` → Publish.

(Or, if you have the Firebase CLI: `firebase deploy --only firestore:rules`.)

`storage.rules` is kept in this repo for reference / in case you later switch to real Storage (e.g. once you're comfortable enabling Blaze), but it isn't deployed or used by the app as it stands.

## 4. Who can do what
| | Visitor (not logged in) | Verified student | Approved faculty | HOD | Admin |
|---|---|---|---|---|---|
| See events, calendar, recaps, registration links | yes | yes | yes | yes | yes |
| Like, comment, vote, organize events | no | yes | yes | yes | yes (no voting) |
| Approve faculty of their department | no | no | no | yes | any department |
| Create polls, approve events, appoint HODs | no | no | no | no | yes |

**Students** register at `register.html` with their college mail (10 letters/digits followed by `@mits.ac.in`) and pick their department. They must click the verification link before they can like, comment or vote. Their comments show their name with the roll number (the 10-character ID) underneath.

**Faculty** choose "Faculty" at registration and use their own `@mits.ac.in` mail (any address that isn't the 10-character ID). After they verify the mail, their department's HOD sees them on **Approvals** and approves or rejects. Until approved they can browse but not like, comment or vote. Their comments show just their name.

**HODs** are appointed by the admin: approve the faculty member, then use **Make HOD** on the Approvals page. Until the first HOD exists, the admin approves faculty directly.

The rules in `firestore.rules` enforce all of this, so it can't be bypassed from the browser. To change the mail formats, edit the regex in **both** `COLLEGE_EMAIL_RE` / `FACULTY_EMAIL_RE` (`js/common.js`) and `hasCollegeEmail()` / `hasFacultyEmail()` (`firestore.rules`). The department list is `DEPARTMENTS` in `js/common.js`. The event categories are `TYPES` in `js/common.js` (also listed in the events rule, `css/style.css` and `js/calendar.js`).

In the Firebase console, **Authentication → Templates → Email address verification** lets you edit the wording of the mail. If students don't receive it, check their spam folder first.

**Admin** (one account, not a college mail):
1. Publish `firestore.rules` (Firestore → Rules → paste → Publish). It recognises the admin by email (`admin@mits.demo`).
2. Open `setup.html` on your deployed site, choose a password, click **Create Admin Account**.
3. Log in at `login.html`. The admin sees "Admin Review" and "Approvals" in the nav.
4. Delete `setup.html` and `js/setup.js` afterwards.
To use a different admin email, change it in both `firestore.rules` (`isAdminEmail`) and `js/setup.js` (`ADMIN_EMAIL`).

Accounts created before this change (for example `user1@mits.demo`) don't match the college format, so they can't like, comment or vote. Re-register with a real college mail.

## Polls
The admin creates polls on the **Polls** page: a question, 2 to 10 options, an audience (whole college, or one department, whose students and faculty only can see and vote), whether voters may pick several options, and a voting period (until closed manually, or until a date and time). One final vote per person; votes are private.

**Live results on/off:** with live results off ("suspense"), the vote counts are held in a separate document that the security rules refuse to serve to anyone but the admin until the poll ends, either at the end time or when the admin closes it. After that, everyone in the audience sees the results. The admin can flip live results on or off at any time, close a poll early, or delete it.

## Event levels
When organizing, the student chooses who the event is for:
- **College level**: open to every department.
- **Department level**: visible to every signed-in student, but only the chosen department's students see the registration link (others see "open to X students only"). Registration happens on an external link, so this part is enforced in the page, not in the rules.
- **Inter-college**: also collects host college, city, contact (required), plus entry fee, last date, team size, eligibility and a brochure link.

Home first asks which cluster you want: **College events** (college-wide and department together, with an All / College-wide / Department filter and a department dropdown) or **Inter-college**. The category chips come next and only list categories that exist in that cluster. The cards sit in a window that scrolls only when there are more events than fit on screen (on phones the page itself scrolls). Events created before levels existed show as college-wide.

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
1. **Register** with a college mail and department, then open the verification link.
2. Go to **Organize Event**, submit an event with a poster image → see "Submitted for approval".
3. Log in as your **admin** account → **Admin Review** → Approve it.
4. Go to **Home** → the event now appears under Upcoming (or Home page, and on the **Calendar**).
5. **Like** the event (heart icon) as any logged-in viewer.
6. To demo the recap flow without waiting a real week: temporarily set that event's `date` field in Firestore to yesterday's date.
7. Log back in as the **organizer** who submitted it → open the event → **Add Recap** → add a summary, optional photos and additional info → Save.
8. Recap is now visible to anyone opening that event's detail view, from Home or Calendar.

## Notes on the security rules
The rules in `firestore.rules` implement the spec (public read of approved events, organizer-only pending reads, forced `pending` status on create, admin-only status changes/deletes, self-only `likedBy` toggles, organizer+past-date-only recap writes). Firestore Security Rules can't easily parse a `"YYYY-MM-DD"` date field against "today" in a fully rigorous way — the recap rule compares the date string against the current date, which is fine for a demo but not bulletproof for edge cases (e.g. time zones right at midnight). For a production version, store event date/time as a Firestore `Timestamp` instead of separate date/time strings and compare against `request.time`.

## File map
- `index.html` / `js/home.js` — Home wall (highlights, upcoming, completed, search/filter, like)
- `calendar.html` / `js/calendar.js` — Month calendar with day drill-down
- `organize.html` / `js/organize.js` — Event submission form
- `admin.html` / `js/admin.js` — Pending-event approval queue
- `login.html`, `register.html` — Firebase Auth email/password
- `js/common.js` — Firebase init, auth-state nav wiring, date/format helpers, image compression
- `verify.html` / `js/verify.js` — mail verification step after sign-up
- `polls.html` / `js/polls.js` — polls (admin creates, members vote)
- `approvals.html` / `js/approvals.js` — HOD / admin approval of faculty accounts
- `js/event-detail.js` — Shared event detail modal + comments + recap view/edit (used by Home and Calendar)
- `firestore.rules` — security rules to paste into the console (`storage.rules` unused, kept for reference)
