export function isImageAvatar(value: string) {
  return (
    value.startsWith('data:image/') ||
    value.startsWith('blob:') ||
    value.startsWith('file:') ||
    value.startsWith('http') ||
    value.startsWith('/')
  );
}

export function isSvgAvatar(value: string) {
  return value.startsWith('data:image/svg+xml') || value.endsWith('.svg');
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener(
      'load',
      () => resolve(typeof reader.result === 'string' ? reader.result : ''),
      { once: true },
    );
    reader.addEventListener('error', () => reject(reader.error), { once: true });
    reader.readAsDataURL(file);
  });
}

const maxAvatarSize = 256;

// Avatars render at 24–96 px; storing the original photo bloats every store snapshot.
export async function readAvatarFile(file: File) {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return readFileAsDataUrl(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return readFileAsDataUrl(file);
  }
  try {
    const scale = maxAvatarSize / Math.max(bitmap.width, bitmap.height);
    if (scale >= 1) return await readFileAsDataUrl(file);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.9);
  } finally {
    bitmap.close();
  }
}
