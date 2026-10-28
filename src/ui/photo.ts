import type { RgbaImage } from '../core/image/gray';

/** Longer side of the working copy. Big enough to trace well, small enough to stay quick. */
const MAX_SIDE = 800;

export interface LoadedPhoto {
  image: RgbaImage;
  /** Object URL of the working copy, for showing it under the outline. Revoke when replaced. */
  url: string;
  width: number;
  height: number;
}

export type PhotoErrorKind = 'not-image' | 'unreadable';

export class PhotoError extends Error {
  constructor(readonly kind: PhotoErrorKind) {
    super(kind);
  }
}

/** The text shown to the user for each way loading can fail. */
export function photoErrorMessage(kind: PhotoErrorKind): string {
  return kind === 'not-image'
    ? 'That file is not a picture. Try a JPG or PNG.'
    : "I couldn't open that picture. Try a JPG or PNG.";
}

/**
 * Decodes a picture on this device (it is never uploaded), applies the camera's rotation,
 * and scales it down to a working size.
 */
export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  if (!file.type.startsWith('image/')) throw new PhotoError('not-image');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('unreadable');
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const data = ctx.getImageData(0, 0, width, height);
  const url = await new Promise<string>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new PhotoError('unreadable'))),
      'image/jpeg',
      0.9,
    ),
  );
  return { image: { width, height, data: data.data }, url, width, height };
}
