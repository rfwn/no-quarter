// A shopper's photo, made small enough to send: longest side 1280px, JPEG, under ~1 MB.
const MAX_SIDE = 1280;
const MAX_CHARS = 1_400_000; // the server accepts up to 1.5M characters of data URL

export async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= MAX_CHARS) return url;
  }
  throw new Error('عکس خیلی بزرگه؛ یه عکس نزدیک‌تر از برچسب بگیر.');
}
