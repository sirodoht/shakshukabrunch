export async function preparePrintImages(root = document) {
  const images = [...root.querySelectorAll(".photo-card img")];
  // Printing uses the same stored previews as the gallery, including off-screen photos.
  await Promise.all(images.map(async (image) => {
    image.loading = "eager";
    try {
      await image.decode();
    } catch {
      // One unavailable photo should not prevent printing the rest of the page.
    }
  }));
  return { count: images.length };
}
