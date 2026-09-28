const defaultMaxDimension = 800;
const defaultQuality = .65;
const imagePreparations = new WeakMap();
const scheduledPreparations = new WeakMap();

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode a gallery image for print."));
    }, "image/jpeg", quality);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not prepare a gallery image for print."));
    image.src = source;
  });
}

async function preparePrintImage(element, { maxDimension, quality }) {
  if (element.dataset.printSrc) return Number(element.dataset.printBytes) || 0;
  const existingPreparation = imagePreparations.get(element);
  if (existingPreparation) return existingPreparation;

  const preparation = (async () => {
    const source = element.getAttribute("src");
    if (!source) return 0;
    const image = await loadImage(source);
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return 0;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, quality);
    canvas.width = 1;
    canvas.height = 1;
    element.dataset.printSrc = URL.createObjectURL(blob);
    element.dataset.printBytes = String(blob.size);
    return blob.size;
  })().catch(() => 0);

  imagePreparations.set(element, preparation);
  return preparation;
}

function requestIdleWork(callback) {
  if ("requestIdleCallback" in window) {
    return { type: "idle", id: window.requestIdleCallback(callback, { timeout: 4_000 }) };
  }
  return { type: "timeout", id: window.setTimeout(callback, 0) };
}

function cancelIdleWork(handle) {
  if (!handle) return;
  if (handle.type === "idle") window.cancelIdleCallback(handle.id);
  else window.clearTimeout(handle.id);
}

function releasePrintImage(image) {
  if (image.hasAttribute("data-screen-src")) {
    image.setAttribute("src", image.dataset.screenSrc);
    image.removeAttribute("data-screen-src");
  }
  if (image.dataset.printSrc) URL.revokeObjectURL(image.dataset.printSrc);
  image.removeAttribute("data-print-src");
  image.removeAttribute("data-print-bytes");
  imagePreparations.delete(image);
}

function cancelScheduledPreparation(root, { releaseInFlight = false } = {}) {
  const state = scheduledPreparations.get(root);
  if (!state) return;
  state.cancelled = true;
  state.releaseInFlight = releaseInFlight;
  cancelIdleWork(state.handle);
  scheduledPreparations.delete(root);
}

export async function preparePrintImages(root = document, options = {}) {
  cancelScheduledPreparation(root);
  const images = [...root.querySelectorAll(".photo-card img")];
  const settings = {
    maxDimension: options.maxDimension || defaultMaxDimension,
    quality: options.quality || defaultQuality,
  };
  let bytes = 0;
  for (const image of images) bytes += await preparePrintImage(image, settings);
  return { count: images.length, bytes };
}

export function schedulePrintImages(root = document, options = {}) {
  cancelScheduledPreparation(root, { releaseInFlight: true });
  const images = [...root.querySelectorAll(".photo-card img")];
  const settings = {
    maxDimension: options.maxDimension || defaultMaxDimension,
    quality: options.quality || defaultQuality,
  };
  const state = { cancelled: false, releaseInFlight: false, handle: null };
  scheduledPreparations.set(root, state);

  const prepareNext = () => {
    state.handle = null;
    if (state.cancelled) return;
    const image = images.shift();
    if (!image) {
      scheduledPreparations.delete(root);
      return;
    }
    void preparePrintImage(image, settings).finally(() => {
      if (state.cancelled) {
        if (state.releaseInFlight) releasePrintImage(image);
        return;
      }
      state.handle = requestIdleWork(prepareNext);
    });
  };

  state.handle = requestIdleWork(prepareNext);
}

export async function activatePrintImages(root = document) {
  const activatedImages = [];
  root.querySelectorAll(".photo-card img[data-print-src]").forEach((image) => {
    if (image.hasAttribute("data-screen-src")) return;
    image.dataset.screenSrc = image.getAttribute("src") || "";
    image.setAttribute("src", image.dataset.printSrc);
    activatedImages.push(image);
  });

  await Promise.all(activatedImages.map(async (image) => {
    try {
      await image.decode();
    } catch {
      image.setAttribute("src", image.dataset.screenSrc);
      image.removeAttribute("data-screen-src");
      await image.decode().catch(() => undefined);
    }
  }));
}

export function restoreScreenImages(root = document) {
  root.querySelectorAll(".photo-card img[data-screen-src]").forEach((image) => {
    image.setAttribute("src", image.dataset.screenSrc);
    image.removeAttribute("data-screen-src");
  });
}

export function releasePrintImages(root = document) {
  cancelScheduledPreparation(root, { releaseInFlight: true });
  root.querySelectorAll(".photo-card img[data-print-src]").forEach(releasePrintImage);
}
