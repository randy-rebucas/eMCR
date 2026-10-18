/**
 * Generates every icon, splash and store asset from the eMCR mark
 * (heart + pulse, same geometry as components/BrandLogo.tsx).
 *
 *   node scripts/generate-brand.mjs
 *
 * Edit the SVG builders below and re-run; outputs are committed.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');

// lib/theme.ts
const C = {
  accent: '#0EA5A4',
  primary: '#0A7F7E',
  primaryDeep: '#075E5D',
  primarySoft: '#E3F6F5',
  text: '#0B2136',
  textMuted: '#5B6B7A',
};

// 24-unit mark geometry, shared with BrandMark.
const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const PULSE = '3.5,11.5 8,11.5 9.5,8.5 11.5,15 13.5,7 15,11.5 20.5,11.5';
const HEART_CY = 12.175; // bbox vertical centre in mark units

const FONT = `'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;

/** transform that centres the 24-unit mark at (cx, cy) with the given scale */
const place = (cx, cy, s) => `translate(${cx - 12 * s} ${cy - HEART_CY * s}) scale(${s})`;

const bgGradient = (id) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#16B9B7"/>
    <stop offset="0.55" stop-color="${C.primary}"/>
    <stop offset="1" stop-color="${C.primaryDeep}"/>
  </linearGradient>`;

const glow = (id) => `
  <radialGradient id="${id}" cx="0.25" cy="0.15" r="0.75">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>`;

const markGradient = (id) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.accent}"/>
    <stop offset="1" stop-color="${C.primary}"/>
  </linearGradient>`;

/** White heart, teal pulse, soft drop shadow — sits on the teal gradient. */
const whiteMark = (cx, cy, s, { shadow = true } = {}) => `
  ${shadow ? `<g transform="${place(cx, cy + s * 0.55, s)}" opacity="0.28" filter="url(#blur)">
    <path d="${HEART}" fill="#03302F"/>
  </g>` : ''}
  <g transform="${place(cx, cy, s)}">
    <path d="${HEART}" fill="#FFFFFF"/>
    <polyline points="${PULSE}" fill="none" stroke="${C.primary}" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

/** Gradient heart, white pulse — the in-app BrandMark, for light surfaces. */
const colorMark = (cx, cy, s) => `
  <g transform="${place(cx, cy, s)}">
    <path d="${HEART}" fill="url(#mark)"/>
    <polyline points="${PULSE}" fill="none" stroke="#FFFFFF" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;

/** Solid white heart with the pulse knocked out (monochrome / notification). */
const knockoutMark = (cx, cy, s) => `
  <mask id="ko" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
    <g transform="${place(cx, cy, s)}">
      <path d="${HEART}" fill="#FFFFFF"/>
      <polyline points="${PULSE}" fill="none" stroke="#000000" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </mask>
  <rect width="100%" height="100%" fill="#FFFFFF" mask="url(#ko)"/>`;

const svg = (w, h, body, defs = '') => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    ${bgGradient('bg')}${glow('glow')}${markGradient('mark')}
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.9"/></filter>
    ${defs}
  </defs>
  ${body}
</svg>`;

// ---- Sources ---------------------------------------------------------------

/** iOS / store icon: full-bleed, opaque (iOS applies its own corner mask). */
const iconSvg = svg(1024, 1024, `
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  ${whiteMark(512, 520, 26)}`);

/** Android adaptive foreground: mark kept inside the 66dp safe circle (≈626px). */
const adaptiveFgSvg = svg(1024, 1024, whiteMark(512, 516, 23));
const adaptiveBgSvg = svg(1024, 1024, `
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>`);
const monochromeSvg = svg(1024, 1024, knockoutMark(512, 516, 23));

/** Splash image: the colour mark alone; background colour comes from app.json. */
const splashSvg = svg(1024, 1024, colorMark(512, 512, 46));

/** Android status-bar notification icon: white on transparent, tinted by the OS. */
const notificationSvg = svg(96, 96, knockoutMark(48, 49, 3.4));

const wordmark = (x, y, size, { dark = true } = {}) => `
  <text x="${x}" y="${y}" font-family="${FONT}" font-weight="800" font-size="${size}"
    letter-spacing="${-size * 0.015}" fill="${dark ? C.text : '#FFFFFF'}"><tspan fill="${dark ? C.primary : '#B9F2EF'}">e</tspan>MCR</text>
  <text x="${x + size * 0.04}" y="${y + size * 0.42}" font-family="${FONT}" font-weight="600"
    font-size="${size * 0.205}" letter-spacing="${size * 0.006}" fill="${dark ? C.textMuted : '#D8F5F3'}">Electronic MyClinic Record</text>`;

/** Horizontal lockup for docs, web, press. */
const logoSvg = (dark) => svg(1200, 360, `
  ${colorMark(180, 172, 11.5)}
  ${wordmark(345, 205, 150, { dark })}`);

/** Lockup on teal (for dark/teal surfaces). */
const logoOnTealSvg = svg(1200, 360, `
  <rect width="1200" height="360" rx="0" fill="url(#bg)"/>
  ${whiteMark(180, 172, 11.5, { shadow: false })}
  ${wordmark(345, 205, 150, { dark: false })}`);

/** Google Play feature graphic, 1024×500. */
const featureSvg = svg(1024, 500, `
  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect width="1024" height="500" fill="url(#glow)"/>
  <!-- oversized pulse trace running behind everything -->
  <polyline points="0,300 300,300 350,220 410,390 470,150 520,300 1024,300" fill="none"
    stroke="#FFFFFF" stroke-opacity="0.07" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <g filter="url(#tileShadow)">
    <rect x="96" y="130" width="240" height="240" rx="56" fill="#FFFFFF"/>
  </g>
  ${colorMark(216, 252, 8.6)}
  <text x="392" y="232" font-family="${FONT}" font-weight="800" font-size="116" letter-spacing="-1.5" fill="#FFFFFF"><tspan fill="#B9F2EF">e</tspan>MCR</text>
  <text x="396" y="284" font-family="${FONT}" font-weight="600" font-size="27" letter-spacing="0.6" fill="#D8F5F3">Electronic MyClinic Record</text>
  <text x="396" y="350" font-family="${FONT}" font-weight="400" font-size="30" fill="#FFFFFF">Your appointments, results &amp; bills</text>
  <text x="396" y="390" font-family="${FONT}" font-weight="400" font-size="30" fill="#FFFFFF">— in your pocket.</text>`,
  `<filter id="tileShadow" x="-30%" y="-30%" width="160%" height="160%">
     <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
     <feOffset dy="10"/>
     <feComponentTransfer><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
     <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
   </filter>`);

// ---- Render ----------------------------------------------------------------

async function png(source, out, { size, opaque = false, trim = false } = {}) {
  const file = join(ASSETS, out);
  await mkdir(dirname(file), { recursive: true });
  let img = sharp(Buffer.from(source), { density: 72 });
  if (size) img = img.resize(size, size);
  if (trim) {
    // crop to content, then restore an even 40px margin
    img = sharp(await img.trim().toBuffer())
      .extend({ top: 40, bottom: 40, left: 40, right: 40, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  if (opaque) img = img.flatten({ background: C.primary }).removeAlpha();
  await img.png({ compressionLevel: 9 }).toFile(file);
  console.log('  ', out);
}

async function saveSvg(source, out) {
  const file = join(ASSETS, out);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source);
  console.log('  ', out);
}

console.log('App assets');
await png(iconSvg, 'icon.png', { opaque: true });
await png(adaptiveFgSvg, 'android-icon-foreground.png');
await png(adaptiveBgSvg, 'android-icon-background.png', { opaque: true });
await png(monochromeSvg, 'android-icon-monochrome.png');
await png(splashSvg, 'splash-icon.png');
await png(notificationSvg, 'notification-icon.png');
await png(iconSvg, 'favicon.png', { size: 48, opaque: true });

console.log('Store assets');
await png(iconSvg, 'store/app-store-icon-1024.png', { opaque: true });
await png(iconSvg, 'store/play-store-icon-512.png', { size: 512, opaque: true });
await png(featureSvg, 'store/play-feature-graphic-1024x500.png', { opaque: true });

console.log('Brand kit');
await saveSvg(splashSvg, 'brand/emcr-mark.svg');
await saveSvg(iconSvg, 'brand/emcr-app-icon.svg');
await png(logoSvg(true), 'brand/emcr-logo.png', { trim: true });
await png(logoSvg(false), 'brand/emcr-logo-white.png', { trim: true });
await png(logoOnTealSvg, 'brand/emcr-logo-on-teal.png', { opaque: true });
