import { LIMITS } from "../shared/types";

const SIZE = 192;

/** Load an image file, fit it into a SIZE x SIZE square (transparent padding) and return a compact data URL. */
export async function fileToIcon(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image"));
      el.src = url;
    });
    const w = img.naturalWidth || SIZE;
    const h = img.naturalHeight || SIZE;
    const scale = Math.min(SIZE / w, SIZE / h);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (SIZE - w * scale) / 2, (SIZE - h * scale) / 2, w * scale, h * scale);

    let data = canvas.toDataURL("image/webp", 0.9);
    if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/png");
    if (data.length > LIMITS.maxImage) throw new Error("Image is too large even after resizing");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
