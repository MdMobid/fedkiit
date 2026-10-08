import "server-only";

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";

import sharp, { type OverlayOptions } from "sharp";
import QRCode from "qrcode";
import { CertificateField } from "./certificates";
import { siteUrl } from "@/lib/env";

/**
 * Points fontconfig at the bundled font before sharp renders any text.
 *
 * librsvg ignores `@font-face`, including the data-URI one in buildSvgDefs, so
 * `font-family: Rubik` is resolved through fontconfig. Vercel's functions ship
 * with essentially no system fonts, so without this the names would come out
 * as missing glyphs. fontconfig reads FONTCONFIG_FILE on first use, so this
 * must run at module load, before the first composite. A deployment that sets
 * FONTCONFIG_FILE itself is left alone.
 *
 * The bundled file is Rubik *Regular* despite its name; the match rule is
 * fontconfig's standard synthetic-bold rule, so `font-weight="700"` still
 * renders bold. System fonts stay included as a fallback for other scripts.
 *
 * On Windows the native library keeps its own copy of the environment and
 * never sees this change, so local dev renders in a system font (Segoe UI).
 * Set FONTCONFIG_FILE before starting the server to preview Rubik there.
 */
function configureFontconfig(): void {
  if (process.env.FONTCONFIG_FILE) return;
  try {
    // fontconfig wants forward slashes, Windows included.
    const slashes = (p: string) => p.split(path.sep).join("/");
    const fontDir = slashes(path.join(process.cwd(), "public", "fonts"));
    const configDir = path.join(os.tmpdir(), "fedkiit-fontconfig");
    mkdirSync(configDir, { recursive: true });
    const configFile = path.join(configDir, "fonts.conf");
    writeFileSync(
      configFile,
      `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${escapeXml(fontDir)}</dir>
  ${process.platform === "win32" ? "<dir>WINDOWSFONTDIR</dir>" : ""}
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <alias binding="same">
    <family>Arial</family>
    <prefer><family>Liberation Sans</family></prefer>
  </alias>
  <cachedir>${escapeXml(slashes(path.join(configDir, "cache")))}</cachedir>
  <match target="font">
    <test name="weight" compare="less_eq"><const>medium</const></test>
    <test target="pattern" name="weight" compare="more_eq"><const>bold</const></test>
    <edit name="embolden" mode="assign"><bool>true</bool></edit>
    <edit name="weight" mode="assign"><const>bold</const></edit>
  </match>
</fontconfig>
`,
    );
    process.env.FONTCONFIG_FILE = configFile;
  } catch (error) {
    console.warn("[compositor] could not write fontconfig file:", error);
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

configureFontconfig();

/**
 * Lazily loads the Rubik Bold TTF as a base64 data URI so librsvg can embed
 * the real font without making any HTTP request.
 *
 * librsvg (used internally by sharp) cannot fetch remote @import URLs at render
 * time — they are silently ignored — causing the text to fall back to whatever
 * system bitmap font is available, which renders pixelated at large sizes.
 * Embedding the TTF as a data URI bypasses that limitation entirely.
 */
let _rubikFontB64: string | null = null;
function getRubikFontB64(): string | null {
  if (_rubikFontB64 !== null) return _rubikFontB64;
  try {
    const fontPath = path.join(process.cwd(), "public", "fonts", "Rubik-Bold.ttf");
    const buf = readFileSync(fontPath);
    _rubikFontB64 = buf.toString("base64");
    return _rubikFontB64;
  } catch {
    console.warn("[compositor] Rubik-Bold.ttf not found in public/fonts — text will use system font fallback");
    _rubikFontB64 = ""; // mark as attempted so we don't retry every render
    return null;
  }
}

/**
 * Build the <defs> block for the SVG overlay.
 * When the local TTF is available it is embedded as a base64 @font-face so
 * librsvg renders proper vector text.  When not available it falls back to the
 * system generic sans-serif (still sharp — just not Rubik).
 */
function buildSvgDefs(): string {
  const fontB64 = getRubikFontB64();
  if (fontB64) {
    return `<defs>
      <style>
        @font-face {
          font-family: 'Rubik';
          src: url('data:font/truetype;base64,${fontB64}') format('truetype');
          font-weight: 700;
          font-style: normal;
        }
        text {
          font-family: 'Rubik', 'Segoe UI', Arial, sans-serif;
          text-rendering: geometricPrecision;
        }
      </style>
    </defs>`;
  }

  // Fallback: no HTTP import (would be ignored by librsvg anyway) — just use system sans
  return `<defs>
    <style>
      text {
        font-family: 'Segoe UI', Arial, sans-serif;
        text-rendering: geometricPrecision;
      }
    </style>
  </defs>`;
}

/**
 * Loads an image buffer from either a web URL, base64 data URI, or local file.
 */
export async function loadTemplateBuffer(templateUrl: string): Promise<Buffer | null> {
  if (!templateUrl) return null;

  try {
    if (templateUrl.startsWith("data:")) {
      const comma = templateUrl.indexOf(",");
      if (comma !== -1) {
        return Buffer.from(templateUrl.slice(comma + 1), "base64");
      }
    }

    if (/^https?:\/\//i.test(templateUrl)) {
      const response = await fetch(templateUrl);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    return null;
  } catch (error) {
    console.error("[compositor] failed to load template buffer:", error);
    return null;
  }
}

/**
 * Server-side compositing of text fields and vector QR codes over a certificate template image.
 *
 * Text rendering uses an embedded base64 Rubik TTF inside the SVG @font-face so
 * librsvg renders the real font with Harfbuzz/FreeType — producing the same
 * crisp vector quality as the QR code rather than a pixelated bitmap fallback.
 */
/**
 * Marks fields saved by the Certificate Studio. Its coordinates and sizes mean
 * something different from the editor that issued every certificate before it
 * (see renderLegacyCertificate), so a template is drawn the studio way only
 * when its fields carry this marker. addCertificateTemplate stamps it on save.
 */
export const STUDIO_LAYOUT = "studio";

export function withStudioLayout<T extends object>(fields: T[]): Array<T & { layout: string }> {
  return fields.map((field) => ({ ...field, layout: STUDIO_LAYOUT }));
}

function isStudioLayout(fields: CertificateField[]): boolean {
  return fields.some((field) => (field as { layout?: unknown }).layout === STUDIO_LAYOUT);
}

/**
 * The origin the old backend put in every QR code (its DOMAIN env). Re-using
 * it makes a re-drawn certificate carry the identical QR to the emailed one.
 */
const LEGACY_QR_ORIGIN = "https://www.fedkiit.com/";

/**
 * Draws a certificate exactly as FED-Backend's sendBatchMails did with
 * node-canvas, for templates saved before the Certificate Studio — every
 * certificate issued up to and including the Studio's release.
 *
 * - Text: `${fontSize}px Arial`, regular weight, unscaled, centred on x% with
 *   its *baseline* at y% (canvas's default "alphabetic" baseline). The old
 *   server's "Arial" was Liberation Sans (fonts-liberation); fontconfig is
 *   aliased to the same font here.
 * - QR: 150x150 PNG (margin 1) whose top-left corner sits at the qr field's
 *   x/y in *pixels*, or 170px in from the bottom-right without one.
 *
 * Reading these numbers the studio way scaled the name ~2.5x, made it bold,
 * centred it vertically and pushed the QR off the page.
 */
async function renderLegacyCertificate(
  imageBuffer: Buffer,
  fields: CertificateField[],
  fieldValues: Record<string, string>,
  qrData: string,
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1200;
  const height = metadata.height || 850;

  const valueFor = (fieldName: string): string => {
    const exact = fieldValues[fieldName];
    if (exact) return String(exact);
    // A few templates were saved with "Name" or "name " — match those to the
    // stored "name" rather than drawing nothing.
    const wanted = fieldName.trim().toLowerCase();
    const key = Object.keys(fieldValues).find(
      (k) => !k.startsWith("_") && k.trim().toLowerCase() === wanted,
    );
    return key ? String(fieldValues[key] ?? "") : "";
  };

  let qrX: number | undefined;
  let qrY: number | undefined;
  const texts: string[] = [];

  for (const field of fields) {
    const legacy = field as CertificateField & { fontColor?: string };
    if (legacy.fieldName === "qr") {
      qrX = Number(legacy.x);
      qrY = Number(legacy.y);
      continue;
    }
    const value = valueFor(legacy.fieldName ?? "");
    if (!value) continue;

    const fontSize = Number(legacy.fontSize ?? 40);
    const color = legacy.fontColor || "#000000";
    const x = (Number(legacy.x) / 100) * width;
    const y = (Number(legacy.y) / 100) * height;
    texts.push(
      `<text x="${x}" y="${y}" font-family="Arial, 'Liberation Sans', sans-serif" font-size="${fontSize}" fill="${escapeXml(color)}" text-anchor="middle">${escapeXml(value)}</text>`,
    );
  }

  const layers: OverlayOptions[] = [];
  if (texts.length > 0) {
    layers.push({
      input: Buffer.from(
        `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${texts.join("")}</svg>`,
      ),
      top: 0,
      left: 0,
    });
  }

  // `||`, not `??`: the old code fell back on 0 as well as on a missing field.
  const left = Math.round(qrX || width - 170);
  const top = Math.round(qrY || height - 170);
  let qr: Buffer = await QRCode.toBuffer(qrData, { width: 150, margin: 1 });
  const qrSize = 150;
  // canvas clipped a QR hanging off the edge; sharp rejects it, so crop first.
  const visibleLeft = Math.max(0, -left);
  const visibleTop = Math.max(0, -top);
  const visibleWidth = Math.min(qrSize, width - left) - visibleLeft;
  const visibleHeight = Math.min(qrSize, height - top) - visibleTop;
  if (visibleWidth > 0 && visibleHeight > 0) {
    if (visibleWidth < qrSize || visibleHeight < qrSize) {
      qr = await sharp(qr)
        .extract({ left: visibleLeft, top: visibleTop, width: visibleWidth, height: visibleHeight })
        .toBuffer();
    }
    layers.push({ input: qr, left: left + visibleLeft, top: top + visibleTop });
  }

  return sharp(imageBuffer).composite(layers).png().toBuffer();
}

export async function compositeCertificate(params: {
  templateUrl?: string;
  templateBuffer?: Buffer | null;
  fields: CertificateField[];
  fieldValues: Record<string, string>;
  certificateId?: string;
  qrUrl?: string;
}): Promise<Buffer | null> {
  const {
    templateUrl,
    templateBuffer: providedBuffer,
    fields = [],
    fieldValues = {},
    certificateId,
    qrUrl,
  } = params;
  const imageBuffer =
    providedBuffer ||
    (templateUrl ? await loadTemplateBuffer(templateUrl) : null);
  if (!imageBuffer) return null;

  if (!isStudioLayout(fields)) {
    try {
      const qrData =
        qrUrl ||
        (certificateId
          ? `${LEGACY_QR_ORIGIN}verify/certificate?id=${certificateId}`
          : `${LEGACY_QR_ORIGIN}test`);
      return await renderLegacyCertificate(imageBuffer, fields, fieldValues, qrData);
    } catch (error) {
      console.error("[compositor] error compositing legacy certificate:", error);
      return null;
    }
  }

  try {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 1200;
    const height = metadata.height || 850;

    // Normal preview width in UI is ~800px; scale element sizes proportionally to native image
    const scale = width > 0 ? width / 800 : 1;

    // Build SVG elements for each configured field (async map for QR code generation)
    const overlayElements = await Promise.all(
      fields.map(async (field) => {
        const rawName = (field.fieldName || "").trim().toLowerCase();
        const color = (field as any).fontColor || field.color || "#000000";

        // Center coordinates in percentage (0..100)
        const xPercent = Number(field.x ?? 50);
        const yPercent = Number(field.y ?? 50);
        const pixelCenterX = Math.round((xPercent / 100) * width);
        const pixelCenterY = Math.round((yPercent / 100) * height);

        // QR Code element handling
        if (rawName === "qr") {
          const targetUrl =
            qrUrl ||
            (certificateId
              ? `${siteUrl()}/verify/certificate?id=${encodeURIComponent(certificateId)}`
              : fieldValues["qrUrl"] || fieldValues["qr"] || "https://fedkiit.com");

          const baseSize = Number(field.fontSize || (field as any).size || 80);
          const boxSize = Math.max(30, Math.round(baseSize * scale));
          // Proportional padding matching Studio's 3px CSS padding + 1.5px border (5px at 800px scale)
          const padding = Math.max(3, Math.round(5 * scale));
          const innerQrSize = Math.max(16, boxSize - padding * 2);
          const qrX = Math.round(pixelCenterX - innerQrSize / 2);
          const qrY = Math.round(pixelCenterY - innerQrSize / 2);

          try {
            const qrSvg = await QRCode.toString(targetUrl, {
              type: "svg",
              margin: 0,
              color: {
                dark: color,
                light: "#00000000", // transparent background
              },
            });

            // Embed positioning and sizing directly into the root <svg> element
            // (QRCode already emits shape-rendering="crispEdges")
            return qrSvg.replace(
              "<svg ",
              `<svg x="${qrX}" y="${qrY}" width="${innerQrSize}" height="${innerQrSize}" `
            );
          } catch (qrErr) {
            console.error("[compositor] failed to generate vector QR code:", qrErr);
            return "";
          }
        }

        // Standard Text element handling
        let val = "";
        for (const [k, v] of Object.entries(fieldValues)) {
          if (k.toLowerCase() === rawName) {
            val = String(v ?? "");
            break;
          }
        }
        if (!val) {
          val = fieldValues["name"] || fieldValues["Name"] || fieldValues["recipient_name"] || "";
        }

        const baseFontSize = Number(field.fontSize ?? 18);
        const fontSize = Math.round(baseFontSize * Math.max(scale, 1));

        // Always use 'Rubik' as the primary font name — it matches the @font-face we inject above.
        // Additional fallbacks are for safety but librsvg will resolve 'Rubik' from the embedded data URI.
        const fontFamily = "Rubik, 'Segoe UI', Arial, sans-serif";

        return `<text x="${pixelCenterX}" y="${pixelCenterY}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="700" fill="${escapeXml(color)}" text-anchor="middle" dominant-baseline="middle" text-rendering="geometricPrecision">${escapeXml(val)}</text>`;
      })
    );

    const defs = buildSvgDefs();

    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      ${overlayElements.filter(Boolean).join("\n")}
    </svg>`;

    const compositedBuffer = await sharp(imageBuffer)
      .composite([{ input: Buffer.from(svg) }])
      .png({ compressionLevel: 6, adaptiveFiltering: true })
      .toBuffer();

    return compositedBuffer;
  } catch (error) {
    console.error("[compositor] error compositing certificate image:", error);
    return null;
  }
}
