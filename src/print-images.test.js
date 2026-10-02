import { expect, test } from "bun:test";
import { preparePrintImages } from "../public/print-images.js";

test("printing loads the existing gallery sources without resizing or replacing them", async () => {
  let finishDecoding;
  const ready = new Promise(resolve => { finishDecoding = resolve; });
  const images = [
    { src: "/previews/second-brunch/photo.webp", loading: "lazy", decode: () => ready },
    { src: "/uploads/second-brunch/legacy.jpg", loading: "lazy", decode: async () => { throw new Error("Unavailable photo"); } },
  ];
  let finished = false;
  const printing = preparePrintImages({ querySelectorAll: () => images }).then(result => {
    finished = true;
    return result;
  });
  await Promise.resolve();
  expect(images.map(image => image.loading)).toEqual(["eager", "eager"]);
  expect(finished).toBe(false);
  finishDecoding();
  expect(await printing).toEqual({ count: 2 });
  expect(images.map(image => image.src)).toEqual(["/previews/second-brunch/photo.webp", "/uploads/second-brunch/legacy.jpg"]);
});
