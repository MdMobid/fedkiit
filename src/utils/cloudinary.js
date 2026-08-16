/**
 * Rewrite a Cloudinary delivery URL to ask for a sensibly-sized image.
 *
 * Most of the media on this site was uploaded straight from a phone or a DSLR
 * and is delivered untouched: measured on the home page, 22 MB of images across
 * 22 requests, roughly 520 MB once decoded, including a single 8.2 MB
 * 6000x4000 JPEG displayed in a 208px box. That is the mobile lag — a phone
 * spends its time downloading and decoding pixels it then throws away.
 *
 * `IMAGE_SIZES` in lib/config/images.ts caps *uploads*, so it does nothing for
 * the images already stored. This caps *delivery* instead, which works on
 * everything, costs one string edit, and is cached by Cloudinary after the
 * first request.
 *
 *   f_auto   — WebP/AVIF where the browser supports it
 *   q_auto   — per-image quality, typically 30-60% smaller than the original
 *   c_limit  — scale down to fit the width, never up, aspect ratio preserved
 *   dpr_auto — one extra pull on retina screens, handled by Cloudinary
 *
 * Anything that is not a Cloudinary URL, or already carries a transformation,
 * is returned untouched.
 *
 * @param {string} url   The image URL.
 * @param {number} width Widest the image will ever be drawn, in CSS pixels.
 */
/**
 * Widths Next's image optimiser will serve. `/_next/image` rejects any `w` that
 * is not in `deviceSizes` + `imageSizes`, so requests are snapped to one of
 * these rather than passed through raw.
 */
const NEXT_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048,
  3840,
];

const snap = (width) =>
  NEXT_WIDTHS.find((w) => w >= width) ?? NEXT_WIDTHS[NEXT_WIDTHS.length - 1];

export function cdn(url, width = 800) {
  if (typeof url !== "string" || !url) return url;

  const w = Math.max(1, Math.round(width));

  if (url.includes("res.cloudinary.com")) {
    const marker = "/upload/";
    const at = url.indexOf(marker);
    if (at === -1) return url;

    const after = url.slice(at + marker.length);
    // Already transformed — a transformation segment is a comma-joined list of
    // `x_y` pairs before the next slash. Leave it alone rather than stacking.
    if (/^[a-z]{1,3}_[^/]*\//.test(after) && !/^v\d+\//.test(after)) return url;

    return `${url.slice(0, at + marker.length)}f_auto,q_auto,c_limit,w_${w},dpr_auto/${after}`;
  }

  // Other remote hosts — chiefly the Webflow CDN the carousel photos still live
  // on, where a single slide is a 4160x3120 original shown in a 277px box. Next
  // resizes and re-encodes those to AVIF/WebP. Only hosts listed under
  // `images.remotePatterns` in next.config.ts are eligible; anything else would
  // 400, so unknown hosts are left alone.
  // Root-relative paths are files in /public and are optimisable too — the hero
  // backdrop is a 1536x1024 PNG drawn in a 156px column, twice.
  if (/^https?:\/\//.test(url) || (url.startsWith("/") && !url.startsWith("//"))) {
    return `/_next/image?url=${encodeURIComponent(url)}&w=${snap(w)}&q=75`;
  }

  return url;
}

export default cdn;
