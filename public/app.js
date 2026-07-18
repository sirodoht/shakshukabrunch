const $ = (selector) => document.querySelector(selector);
const defaultServings = 4;
const photoOwnerStorageKey = "shakshuka-photo-owners";
const rsvpOwnerStorageKey = "shakshuka-rsvp-owners";
const adminStorageKey = "shakshuka-admin-mode";
let state = { rsvps: [], songs: [], photos: [] };
let recipeServings = defaultServings;
let recipeManuallyChanged = false;
let photoOwnerTokens = loadPhotoOwnerTokens();
let rsvpOwnerTokens = loadRsvpOwnerTokens();
let adminMode = loadAdminMode();

function loadAdminMode() {
  try {
    if (["/admin", "/admin/"].includes(window.location.pathname)) localStorage.setItem(adminStorageKey, "true");
    return localStorage.getItem(adminStorageKey) === "true";
  } catch {
    return ["/admin", "/admin/"].includes(window.location.pathname);
  }
}

function loadPhotoOwnerTokens() {
  try {
    return JSON.parse(localStorage.getItem(photoOwnerStorageKey) || "{}") || {};
  } catch {
    return {};
  }
}

function savePhotoOwnerTokens() {
  try {
    localStorage.setItem(photoOwnerStorageKey, JSON.stringify(photoOwnerTokens));
  } catch {
    // The in-memory key still works until this tab closes.
  }
}

function loadRsvpOwnerTokens() {
  try {
    return JSON.parse(localStorage.getItem(rsvpOwnerStorageKey) || "{}") || {};
  } catch {
    return {};
  }
}

function saveRsvpOwnerTokens() {
  try {
    localStorage.setItem(rsvpOwnerStorageKey, JSON.stringify(rsvpOwnerTokens));
  } catch {
    // The in-memory key still works until this tab closes.
  }
}

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
  { name: "sourdough slices", per: 1.25, unit: "", round: "whole" },
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
  $("#seatMessage").textContent = "Each plate has 7 lines, either black or white.";

  const manifestRsvps = adminMode ? state.rsvps : state.rsvps.filter((rsvp) => rsvp.attendance !== "no" || rsvpOwnerTokens[rsvp.id]);
  $("#guestList").innerHTML = manifestRsvps.length ? manifestRsvps.map((rsvp) => {
    const details = [
      Number(rsvp.partySize) > 1 ? `<div><dt>Party size</dt><dd>${rsvp.partySize}</dd></div>` : "",
      rsvp.dietary ? `<div><dt>Food notes</dt><dd>${escapeHtml(rsvp.dietary)}</dd></div>` : "",
      rsvp.contribution ? `<div><dt>Bringing</dt><dd>${escapeHtml(rsvp.contribution)}</dd></div>` : "",
    ].filter(Boolean).join("");
    const attendanceLabel = rsvp.attendance === "yes" ? "Coming" : rsvp.attendance === "maybe" ? "Maybe-ish" : "Not coming";
    const canDelete = adminMode || rsvpOwnerTokens[rsvp.id];
    return `<article class="guest-card${details ? "" : " guest-card-name-only"}"><header><h4>${escapeHtml(rsvp.name)}</h4><div class="guest-card-actions"><span class="attendance-badge ${rsvp.attendance}">${attendanceLabel}</span>${canDelete ? `<button class="guest-delete" type="button" data-rsvp-id="${escapeHtml(rsvp.id)}" aria-label="Delete ${escapeHtml(rsvp.name)} from the guest list">×</button>` : ""}</div></header>${details ? `<dl>${details}</dl>` : ""}</article>`;
  }).join("") : `<p class="empty-state">Nobody has materialised yet. Be the first brunch character.</p>`;

  if (syncRecipe && !recipeManuallyChanged) {
    recipeServings = Math.max(defaultServings, confirmed);
    renderRecipe();
  }

  $("#songCount").textContent = `${state.songs.length} ${state.songs.length === 1 ? "track" : "tracks"}`;
  $("#songList").innerHTML = state.songs.length ? state.songs.map((song) => `<li><strong>${song.url ? `<a href="${escapeHtml(song.url)}" target="_blank" rel="noreferrer">${escapeHtml(song.title)} ↗</a>` : escapeHtml(song.title)}</strong><span>${escapeHtml(song.artist || "Artist unknown")} · added by ${escapeHtml(song.addedBy)}</span></li>`).join("") : `<li class="empty-state">Currently silence.</li>`;

  $("#galleryGrid").innerHTML = state.photos.length ? state.photos.map((photo) => `<article class="photo-card">${adminMode || photoOwnerTokens[photo.id] ? `<button class="photo-delete" type="button" data-photo-id="${escapeHtml(photo.id)}" aria-label="Delete this photo">× <span>Delete</span></button>` : ""}<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.caption || "Brunch gallery photo")}" loading="lazy" /><p>${escapeHtml(photo.caption || "Untitled brunch moment")}</p><small>by ${escapeHtml(photo.uploader)}</small></article>`).join("") : `<div class="gallery-empty"><span>☀</span><p>No photos yet, please take a photo of me!</p></div>`;
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

function startTickerMoodSwings() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ticker = $(".ticker div");
  const animation = ticker?.getAnimations()[0];
  if (!animation) return;
  let nextSpeedIsFast = true;

  function chooseNewSpeed() {
    const startingRate = animation.playbackRate;
    const isFastMode = nextSpeedIsFast;
    const targetRate = isFastMode
      ? 2.2 + Math.random() * 2.4
      : .18 + Math.random() * .52;
    nextSpeedIsFast = !nextSpeedIsFast;
    const startedAt = performance.now();
    const transitionTime = 180 + Math.random() * 520;

    function glide(timestamp) {
      const progress = Math.min(1, (timestamp - startedAt) / transitionTime);
      const eased = progress * progress * (3 - 2 * progress);
      const nextRate = startingRate + (targetRate - startingRate) * eased;
      if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(nextRate);
      else animation.playbackRate = nextRate;

      if (progress < 1) window.requestAnimationFrame(glide);
      else {
        const holdTime = 180 + Math.random() * 900;
        window.setTimeout(chooseNewSpeed, holdTime * (isFastMode ? 4 : 1));
      }
    }

    window.requestAnimationFrame(glide);
  }

  window.setTimeout(chooseNewSpeed, 1_000);
}

$("#minusServing").addEventListener("click", () => { recipeManuallyChanged = true; recipeServings = Math.max(1, recipeServings - 1); renderRecipe(); });
$("#plusServing").addEventListener("click", () => { recipeManuallyChanged = true; recipeServings = Math.min(30, recipeServings + 1); renderRecipe(); });

$("#contribution").addEventListener("input", (event) => {
  const value = event.target.value.trim().toLowerCase();
  const match = value.length > 2 && state.rsvps.find((r) => r.contribution && (r.contribution.toLowerCase().includes(value) || value.includes(r.contribution.toLowerCase())));
  const note = $("#duplicateNote");
  note.classList.toggle("warning", Boolean(match));
  note.textContent = match ? `${match.name} may already be bringing “${match.contribution}” — coordinate or diversify!` : "";
});

$("#rsvpForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  setStatus($("#rsvpStatus"), "Sending your tiny digital place card…");
  try {
    const rsvpData = formToObject(form);
    const ownerToken = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    rsvpData.ownerToken = ownerToken;
    state = await api("/api/rsvp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rsvpData) });
    if (state.submittedRsvpId) {
      rsvpOwnerTokens[state.submittedRsvpId] = ownerToken;
      saveRsvpOwnerTokens();
    }
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
    const formData = new FormData(form);
    const ownerToken = crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    formData.append("ownerToken", ownerToken);
    state = await api("/api/photos", { method: "POST", body: formData });
    if (state.uploadedPhotoId) {
      photoOwnerTokens[state.uploadedPhotoId] = ownerToken;
      savePhotoOwnerTokens();
    }
    renderState({ syncRecipe: false });
    form.reset();
    $("#photoPreview").removeAttribute("src");
    $(".drop-zone").classList.remove("has-preview");
    setStatus($("#photoStatus"), "Beautiful. It’s on the sunny roll.");
    showToast("Photo added to the sunny roll ☀");
  } catch (error) { setStatus($("#photoStatus"), error.message, true); }
  finally { button.disabled = false; }
});

$("#galleryGrid").addEventListener("click", async (event) => {
  const button = event.target.closest(".photo-delete");
  if (!button) return;
  const photoId = button.dataset.photoId;
  const ownerToken = photoOwnerTokens[photoId];
  if ((!adminMode && !ownerToken) || !window.confirm("Remove this photo from the sunny roll?")) return;

  button.disabled = true;
  try {
    state = await api(`/api/photos/${photoId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(adminMode ? { "X-Brunch-Admin": "local-storage" } : {}) },
      body: JSON.stringify({ ownerToken }),
    });
    delete photoOwnerTokens[photoId];
    savePhotoOwnerTokens();
    renderState({ syncRecipe: false });
    showToast("Photo removed from the sunny roll");
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
});

$("#guestList").addEventListener("click", async (event) => {
  const button = event.target.closest(".guest-delete");
  if (!button) return;
  const rsvpId = button.dataset.rsvpId;
  const ownerToken = rsvpOwnerTokens[rsvpId];
  if ((!adminMode && !ownerToken) || !window.confirm("Remove this RSVP and everything shared with it?")) return;
  button.disabled = true;
  try {
    state = await api(`/api/rsvps/${rsvpId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(adminMode ? { "X-Brunch-Admin": "local-storage" } : {}) },
      body: JSON.stringify({ ownerToken }),
    });
    delete rsvpOwnerTokens[rsvpId];
    saveRsvpOwnerTokens();
    renderState();
    showToast("Guest removed from the brunch manifest");
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
});

if (adminMode) {
  $("#adminBar").hidden = false;
}

$("#leaveAdmin").addEventListener("click", () => {
  try { localStorage.removeItem(adminStorageKey); } catch {}
  window.location.href = "/";
});

const schedule = [...document.querySelectorAll(".schedule li")].map((item) => {
  const time = item.querySelector("time");
  const heading = item.querySelector("h3").cloneNode(true);
  heading.querySelector(".tag")?.remove();
  return {
    at: time.dateTime,
    title: heading.textContent.trim(),
    aside: item.querySelector("p").textContent.trim(),
  };
});
const officialBrunchTime = new Date("2026-07-19T11:30:00+01:00");
let previewIndex = null;

function updateCountdown() {
  const remaining = officialBrunchTime.getTime() - Date.now();
  const heroCountdown = $("#heroCountdown");
  const boardCountdown = $("#boardCountdown");

  if (remaining <= 0) {
    heroCountdown.textContent = "BRUNCH IS ON!";
    boardCountdown.innerHTML = `<div class="countdown-unit"><strong>00</strong><small>Time to eat</small></div>`;
    boardCountdown.style.gridTemplateColumns = "minmax(180px, 1fr)";
    return;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const parts = [
    { label: "Days", value: Math.floor(totalSeconds / 86400) },
    { label: "Hours", value: Math.floor((totalSeconds % 86400) / 3600) },
    { label: "Minutes", value: Math.floor((totalSeconds % 3600) / 60) },
    { label: "Seconds", value: totalSeconds % 60 },
  ];
  const padded = parts.map((part) => String(part.value).padStart(2, "0"));
  heroCountdown.textContent = `${padded[0]}d ${padded[1]}h ${padded[2]}m ${padded[3]}s`;
  boardCountdown.style.removeProperty("grid-template-columns");
  boardCountdown.innerHTML = parts.map((part, index) => `<div class="countdown-unit"><strong>${padded[index]}</strong><small>${part.label}</small></div>`).join("");
}

function updateLiveBoard() {
  const now = previewIndex === null ? new Date() : new Date(schedule[previewIndex].at);
  const first = new Date(schedule[0].at);
  const last = new Date(schedule[schedule.length - 1].at);
  let current;
  let next;
  if (now < first) {
    const lessThanElevenHoursUntilStart = first.getTime() - now.getTime() < 11 * 60 * 60 * 1000;
    current = {
      title: "Counting down to Sunday",
      aside: lessThanElevenHoursUntilStart
        ? "We have sooo much time till 11am!"
        : "We have sooo much time till Sunday!",
    };
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
  startTickerMoodSwings();
  updateCountdown();
  updateLiveBoard();
  window.setInterval(updateCountdown, 1_000);
  window.setInterval(updateLiveBoard, 60_000);
  try {
    state = await api("/api/state");
    renderState();
  } catch {
    showToast("Live updates are taking a tiny nap.");
  }
}

init();
