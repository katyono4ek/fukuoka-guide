/*
 * Photo formats shared by the build, the validator and tools/photo.mjs.
 * Every photo is pre-cropped to its layout's ratio, so the markup can state
 * exact dimensions and the page never shifts while images load.
 */

export const PHOTO_FORMATS = {
  hero: { ratio: [16, 7], widths: [960, 1920] },
  card: { ratio: [3, 2], widths: [640, 1280] },
};

/** "hero" is the hero image; every other key is "<section id>/<item id>" on a card. */
export const photoFormat = (key) => (key === 'hero' ? 'hero' : 'card');

export const photoFile = (key, width) => `${key.replace('/', '-')}-${width}.webp`;

export const photoHeight = (format, width) =>
  Math.round((width * PHOTO_FORMATS[format].ratio[1]) / PHOTO_FORMATS[format].ratio[0]);

/** Reads width and height from a WebP header (lossy, lossless or extended). */
export function webpSize(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}
