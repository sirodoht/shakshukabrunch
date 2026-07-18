const $ = (selector) => document.querySelector(selector);
const plannedGuests = 9;
let state = { rsvps: [], songs: [], photos: [] };
let recipeServings = plannedGuests;
let recipeManuallyChanged = false;

const ingredients = [
  { name: "large eggs", per: 2, unit: "", round: "whole" },
  { name: "chopped tomatoes", per: 400 / 3, unit: "g", round: "50" },
  { name: "red peppers", per: 1 / 3, unit: "", round: "half" },
  { name: "onions", per: 1 / 3, unit: "", round: "half" },
  { name: "garlic cloves", per: 2 / 3, unit: "", round: "whole" },
  { name: "ground cumin", per: 1 / 3, unit: "tsp", round: "half" },
  { name: "smoked paprika", per: 1 / 3, unit: "tsp", round: "half" },
  { name: "fresh chilli", per: 1 / 6, unit: "", round: "half" },
  { name: "feta", per: 100 / 3, unit: "g", round: "25" },
  { name: "flatbreads / pittas", per: 1.25, unit: "", round: "whole" },
  { name: "parsley or coriander", per: 1 / 9, unit: "bunch", round: "quarter" },
];

function roundAmount(value, mode) {
  if (mode === "whole") return Math.max(1, Math.round(value));
  if (mode === "50") return Math.max(50, Math.round(value / 50) * 50);
  if (mode === "25") return Math.max(25, Math.round(value / 25) * 25);
  if (mode === "half") return Math.max(.5, Math.round(value * 2) / 2);
  if (mode === "quarter") return Math.max(.25, Math.round(value * 4) / 4);
  return value;
}

function displayAmount(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace("0.25", "¼").replace("0.5", "½").replace("0.75", "¾");
}

function renderRecipe() {
  $("#servingCount").textContent = recipeServings;
  $("#recipeTitleCount").textContent = recipeServings;
  $("#ingredientsList").innerHTML = ingredients.map((item) => {
    const amount = displayAmount(roundAmount(item.per * recipeServings, item.round));
    return `<li><strong>${amount}${item.unit ? ` ${item.unit}` : ""}</strong><span>${item.name}</span></li>`;
  }).join("");
}

function confirmedGuests() {
  return state.rsvps.filter((r) => r.attendance === "yes").reduce((sum, r) => sum + r.partySize, 0);
}

function escapeHtml(value = "") {
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

function renderState({ syncRecipe = true } = {}) {
  const confirmed = confirmedGuests();
  $("#confirmedCount").textContent = confirmed;
  $("#seatMessage").textContent = confirmed === 0 ? "Nine plates are waiting patiently." : confirmed < 9 ? `${9 - confirmed} ${9 - confirmed === 1 ? "seat" : "seats"} still doing absolutely nothing.` : confirmed === 9 ? "A perfectly full pan. Magnificent." : `${confirmed - 9} over plan. We’ll get a bigger pan.`;

  const visibleRsvps = state.rsvps.filter((r) => r.attendance !== "no");
  $("#guestChips").innerHTML = visibleRsvps.map((r) => `<span class="guest-chip ${r.attendance}">${escapeHtml(r.name)}${r.partySize > 1 ? ` +${r.partySize - 1}` : ""}${r.attendance === "maybe" ? " · maybe" : ""}</span>`).join("");

  const contributions = state.rsvps.filter((r) => r.attendance !== "no" && r.contribution);
  $("#contributionList").innerHTML = contributions.length ? contributions.map((r) => `<div class="contribution-item"><strong>${escapeHtml(r.contribution)}</strong><span>via ${escapeHtml(r.name)}</span></div>`).join("") : `<p class="empty-state">Nothing claimed yet. The table is your oyster. (Please don’t bring oysters.)</p>`;

  if (syncRecipe && confirmed > 0 && !recipeManuallyChanged) {
    recipeServings = confirmed;
    $("#recipeSyncNote").textContent = "Synced to yes RSVPs";
    renderRecipe();
  }

  $("#songCount").textContent = `${state.songs.length} ${state.songs.length === 1 ? "track" : "tracks"}`;
  $("#songList").innerHTML = state.songs.length ? state.songs.map((song) => `<li><strong>${song.url ? `<a href="${escapeHtml(song.url)}" target="_blank" rel="noreferrer">${escapeHtml(song.title)} ↗</a>` : escapeHtml(song.title)}</strong><span>${escapeHtml(song.artist || "Artist unknown")} · added by ${escapeHtml(song.addedBy)}</span></li>`).join("") : `<li class="empty-state">The dance floor is silent. Be brave.</li>`;

  $("#galleryGrid").innerHTML = state.photos.length ? state.photos.map((photo) => `<article class="photo-card"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.caption || "Brunch gallery photo")}" loading="lazy" /><p>${escapeHtml(photo.caption || "Untitled brunch moment")}</p><small>by ${escapeHtml(photo.uploader)}</small></article>`).join("") : `<div class="gallery-empty"><span>☀</span><p>The gallery opens whenever the first camera does.</p></div>`;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Something went wrong.");
  return result;
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3400);
}

$("#minusServing").addEventListener("click", () => { recipeManuallyChanged = true; recipeServings = Math.max(1, recipeServings - 1); $("#recipeSyncNote").textContent = "Adjusted by the chef"; renderRecipe(); });
$("#plusServing").addEventListener("click", () => { recipeManuallyChanged = true; recipeServings = Math.min(30, recipeServings + 1); $("#recipeSyncNote").textContent = "Adjusted by the chef"; renderRecipe(); });

$("#contribution").addEventListener("input", (event) => {
  const value = event.target.value.trim().toLowerCase();
  const match = value.length > 2 && state.rsvps.find((r) => r.contribution && (r.contribution.toLowerCase().includes(value) || value.includes(r.contribution.toLowerCase())));
  const note = $("#duplicateNote");
  note.classList.toggle("warning", Boolean(match));
  note.textContent = match ? `${match.name} may already be bringing “${match.contribution}” — coordinate or diversify!` : "See what’s already coming below.";
});

$("#rsvpForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  setStatus($("#rsvpStatus"), "Sending your tiny digital place card…");
  try {
    state = await api("/api/rsvp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formToObject(form)) });
    recipeManuallyChanged = false;
    renderState();
    form.reset();
    form.querySelector("[value=yes]").checked = true;
    setStatus($("#rsvpStatus"), "You’re on the list. Excellent decision.");
    showToast("RSVP saved — the recipe has done the maths ✦");
  } catch (error) { setStatus($("#rsvpStatus"), error.message, true); }
  finally { button.disabled = false; }
});

$("#songForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  setStatus($("#songStatus"), "Dropping the needle…");
  try {
    state = await api("/api/songs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formToObject(form)) });
    renderState({ syncRecipe: false });
    form.reset();
    setStatus($("#songStatus"), "Added. The kitchen just got 14% groovier.");
    showToast("Song added to Side A ♫");
  } catch (error) { setStatus($("#songStatus"), error.message, true); }
  finally { button.disabled = false; }
});

$("#photoInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  const zone = event.target.closest(".drop-zone");
  if (!file) return zone.classList.remove("has-preview");
  $("#photoPreview").src = URL.createObjectURL(file);
  zone.classList.add("has-preview");
});

$("#photoForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  setStatus($("#photoStatus"), "Developing in our imaginary darkroom…");
  try {
    state = await api("/api/photos", { method: "POST", body: new FormData(form) });
    renderState({ syncRecipe: false });
    form.reset();
    $("#photoPreview").removeAttribute("src");
    $(".drop-zone").classList.remove("has-preview");
    setStatus($("#photoStatus"), "Beautiful. It’s on the sunny roll.");
    showToast("Photo added to the sunny roll ☀");
  } catch (error) { setStatus($("#photoStatus"), error.message, true); }
  finally { button.disabled = false; }
});

const schedule = [
  { at: "2026-07-19T11:00:00+01:00", title: "Early Bird Chopping Club", aside: "Coffee, onions, low-stakes knife work." },
  { at: "2026-07-19T11:30:00+01:00", title: "Official hello", aside: "Hugs are happening. Find a drink." },
  { at: "2026-07-19T11:45:00+01:00", title: "Mise en place circus", aside: "Somebody please watch the garlic." },
  { at: "2026-07-19T12:15:00+01:00", title: "Eggs are going in", aside: "This is not a drill. Protect the yolks." },
  { at: "2026-07-19T12:35:00+01:00", title: "The shakshuka lands", aside: "Tear bread. Make happy noises." },
  { at: "2026-07-19T13:30:00+01:00", title: "Seconds & kitchen disco", aside: "Tea towels may become costumes." },
  { at: "2026-07-19T15:00:00+01:00", title: "The soft goodbye", aside: "Leftovers draft and long doorstep chats." },
];
let previewIndex = null;

function updateLiveBoard() {
  const now = previewIndex === null ? new Date() : new Date(schedule[previewIndex].at);
  const first = new Date(schedule[0].at);
  const last = new Date(schedule[schedule.length - 1].at);
  let current;
  let next;
  if (now < first) {
    current = { title: "Counting down to Sunday", aside: "Hydrate. Locate your tote bag." };
    next = schedule[0];
  } else if (now > new Date(last.getTime() + 2 * 60 * 60 * 1000)) {
    current = { title: "The pans are resting", aside: "Thanks for bringing your whole lovely self." };
    next = { title: "Leftover shakshuka for breakfast", at: "2026-07-20T09:00:00+01:00" };
  } else {
    const index = [...schedule].reverse().findIndex((item) => now >= new Date(item.at));
    const realIndex = schedule.length - 1 - index;
    current = schedule[Math.max(0, realIndex)];
    next = schedule[realIndex + 1] || { title: "A very slow goodbye", at: "2026-07-19T16:00:00+01:00" };
  }
  $("#happeningNow").textContent = current.title;
  $("#nowAside").textContent = current.aside;
  $("#happeningNext").textContent = next.title;
  $("#nextTime").textContent = new Date(next.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

$("#previewDay").addEventListener("click", (event) => {
  previewIndex = previewIndex === null ? 0 : previewIndex + 1;
  if (previewIndex >= schedule.length) previewIndex = null;
  event.currentTarget.textContent = previewIndex === null ? "Preview event day" : "Next moment →";
  updateLiveBoard();
});

async function init() {
  renderRecipe();
  updateLiveBoard();
  window.setInterval(updateLiveBoard, 60_000);
  try {
    state = await api("/api/state");
    renderState();
  } catch {
    showToast("Live updates are taking a tiny nap.");
  }
}

init();
