export function validateAvatarFile(file: File): void {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("JPG, PNG or WebP image required");
  }
  if (file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error("Account photo must be 5 MB or smaller");
  }
}

export function squareCrop(width: number, height: number, zoom: number, horizontal: number, vertical: number) {
  const size = Math.min(width, height) / Math.max(1, Math.min(3, zoom));
  return { size, x: (width - size) * Math.max(0, Math.min(100, horizontal)) / 100,
    y: (height - size) * Math.max(0, Math.min(100, vertical)) / 100 };
}

export async function cropAvatar(image: HTMLImageElement, zoom: number, horizontal: number, vertical: number): Promise<File> {
  const crop = squareCrop(image.naturalWidth, image.naturalHeight, zoom, horizontal, vertical);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo preview is not supported by this browser");
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, 512, 512);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    result => result ? resolve(result) : reject(new Error("Photo could not be cropped")), "image/png"));
  return new File([blob], "profile.png", { type: "image/png" });
}
