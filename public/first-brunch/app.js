import { activatePrintImages, preparePrintImages, releasePrintImages, restoreScreenImages, schedulePrintImages } from "./print-images.js";

const $ = (selector) => document.querySelector(selector);
const defaultServings = 4;
let state = { rsvps: [], songs: [], photos: [] };
let recipeServings = defaultServings;
let lightboxIndex = -1;
let lightboxTrigger = null;

async function printPage() {
  const button = $("#printPage");
  if (button.disabled) return;
  const label = button.innerHTML;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Preparing to print…";
  try {
    await preparePrintImages($("#galleryGrid"));
    await activatePrintImages();
    window.print();
  } finally {
    restoreScreenImages();
    button.innerHTML = label;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

$("#printPage").addEventListener("click", printPage);
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() !== "p" || (!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return;
  event.preventDefault();
  void printPage();
});
window.addEventListener("beforeprint", () => void activatePrintImages());
window.addEventListener("afterprint", () => restoreScreenImages());

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

function renderState() {
  const confirmed = confirmedGuests();

  const manifestRsvps = state.rsvps.filter((rsvp) => rsvp.attendance !== "no");
  $("#guestList").innerHTML = manifestRsvps.length ? manifestRsvps.map((rsvp) => {
    const details = [
      Number(rsvp.partySize) > 1 ? `<div><dt>Party size</dt><dd>${rsvp.partySize}</dd></div>` : "",
      rsvp.dietary ? `<div><dt>Food notes</dt><dd>${escapeHtml(rsvp.dietary)}</dd></div>` : "",
      rsvp.contribution ? `<div><dt>Bringing</dt><dd>${escapeHtml(rsvp.contribution)}</dd></div>` : "",
    ].filter(Boolean).join("");
    const attendanceLabel = rsvp.attendance === "yes" ? "Coming" : rsvp.attendance === "maybe" ? "Maybe-ish" : "Not coming";
    return `<article class="guest-card${details ? "" : " guest-card-name-only"}"><header><h4>${escapeHtml(rsvp.name)}</h4><div class="guest-card-actions"><span class="attendance-badge ${rsvp.attendance}">${attendanceLabel}</span></div></header>${details ? `<dl>${details}</dl>` : ""}</article>`;
  }).join("") : `<p class="empty-state">Nobody has materialised yet. Be the first brunch character.</p>`;

  recipeServings = Math.max(defaultServings, confirmed);
  renderRecipe();

  $("#songCount").textContent = `${state.songs.length} ${state.songs.length === 1 ? "track" : "tracks"}`;
  $("#songList").innerHTML = state.songs.length ? state.songs.map((song) => {
    return `<li><div class="song-row"><div class="song-details"><strong>${song.url ? `<a href="${escapeHtml(song.url)}" target="_blank" rel="noreferrer">${escapeHtml(song.title)} ↗</a>` : escapeHtml(song.title)}</strong><span>${escapeHtml(song.artist || "Artist unknown")} · added by ${escapeHtml(song.addedBy)}</span></div></div></li>`;
  }).join("") : `<li class="empty-state">Currently silence.</li>`;

  const galleryGrid = $("#galleryGrid");
  releasePrintImages(galleryGrid);
  galleryGrid.innerHTML = state.photos.length ? state.photos.map((photo, index) => `<article class="photo-card"><button class="photo-open" type="button" data-photo-index="${index}" aria-label="View ${escapeHtml(photo.caption || "brunch gallery photo")} full screen"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.caption || "Brunch gallery photo")}" loading="lazy" /></button><p>${escapeHtml(photo.caption || "Untitled brunch moment")}</p><small>by ${escapeHtml(photo.uploader)}</small></article>`).join("") : `<div class="gallery-empty"><span>☀</span><p>No photos yet, please take a photo of me!</p></div>`;
  schedulePrintImages(galleryGrid);
}

function showLightboxPhoto(index) {
  if (!state.photos.length) return;
  lightboxIndex = (index + state.photos.length) % state.photos.length;
  const photo = state.photos[lightboxIndex];
  $("#lightboxImage").src = photo.url;
  $("#lightboxImage").alt = photo.caption || "Brunch gallery photo";
  $("#lightboxCaption").textContent = photo.caption || "Untitled brunch moment";
  $("#lightboxUploader").textContent = photo.uploader ? `by ${photo.uploader}` : "";
  $("#lightboxCount").textContent = `${lightboxIndex + 1} / ${state.photos.length}`;
  const hasMultiplePhotos = state.photos.length > 1;
  $("#lightboxPrevious").hidden = !hasMultiplePhotos;
  $("#lightboxNext").hidden = !hasMultiplePhotos;
}

function openLightbox(index, trigger) {
  lightboxTrigger = trigger;
  showLightboxPhoto(index);
  $("#photoLightbox").hidden = false;
  document.body.classList.add("lightbox-open");
  $("#lightboxClose").focus();
}

function closeLightbox() {
  const lightbox = $("#photoLightbox");
  if (lightbox.hidden) return;
  lightbox.hidden = true;
  document.body.classList.remove("lightbox-open");
  $("#lightboxImage").removeAttribute("src");
  lightboxTrigger?.focus();
  lightboxTrigger = null;
  lightboxIndex = -1;
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

$("#galleryGrid").addEventListener("click", (event) => {
  const button = event.target.closest(".photo-open");
  if (button) openLightbox(Number(button.dataset.photoIndex), button);
});

$("#lightboxPrevious").addEventListener("click", () => showLightboxPhoto(lightboxIndex - 1));
$("#lightboxNext").addEventListener("click", () => showLightboxPhoto(lightboxIndex + 1));
$("#lightboxClose").addEventListener("click", closeLightbox);
$("#photoLightbox").addEventListener("click", (event) => {
  if (!event.target.closest(".lightbox-arrow, .lightbox-close")) closeLightbox();
});

document.addEventListener("keydown", (event) => {
  if ($("#photoLightbox").hidden) return;
  if (event.key === "Escape") closeLightbox();
  if (event.key === "ArrowLeft") showLightboxPhoto(lightboxIndex - 1);
  if (event.key === "ArrowRight") showLightboxPhoto(lightboxIndex + 1);
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
const frozenAt = new Date("2026-09-30T22:50:00Z");

function updateCountdown() {
  const remaining = officialBrunchTime.getTime() - frozenAt.getTime();
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
  const now = frozenAt;
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

// Keep the archived presentation and always read the first brunch's data.
async function init() {
  renderRecipe();
  startTickerMoodSwings();
  updateCountdown();
  updateLiveBoard();
  try {
    const response = await fetch("/api/brunches/first-brunch/state");
    if (!response.ok) throw new Error("Could not load the archive.");
    state = await response.json();
    renderState();
  } catch {
    showToast("Could not load the archived brunch. Please reload.");
  }
}

init();
