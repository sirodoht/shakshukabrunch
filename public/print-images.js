const defaultMaxDimension = 800;
const defaultQuality = .65;
const imagePreparations = new WeakMap();

function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? 0 : Math.ceil((dataUrl.length - comma - 1) * .75);
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
  if (element.dataset.printSrc) return dataUrlBytes(element.dataset.printSrc);
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
    const printSource = canvas.toDataURL("image/jpeg", quality);
    element.dataset.printSrc = printSource;
    return dataUrlBytes(printSource);
  })().catch(() => 0);

  imagePreparations.set(element, preparation);
  return preparation;
}

export async function preparePrintImages(root = document, options = {}) {
  const images = [...root.querySelectorAll(".photo-card img")];
  const settings = {
    maxDimension: options.maxDimension || defaultMaxDimension,
    quality: options.quality || defaultQuality,
  };
  const sizes = await Promise.all(images.map((image) => preparePrintImage(image, settings)));
  return { count: images.length, bytes: sizes.reduce((total, size) => total + size, 0) };
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
