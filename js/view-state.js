// The Wall and the Calendar share one "view": which level you are looking at
// (college-wide / department / inter-college) and which department.
// It lives in localStorage so changing it on either page carries over to the other.
const KEY = "wall-view";

export function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      scope: v.scope === "inter" ? "inter" : "college",
      sub: v.sub === "department" ? "department" : "college",
      dept: typeof v.dept === "string" ? v.dept : null
    };
  } catch (e) {
    return { scope: "college", sub: "college", dept: null };
  }
}

export function saveView(patch) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...loadView(), ...patch })); } catch (e) { /* storage unavailable */ }
}
