// Renders the app icon, Android adaptive icon layers, splash image and favicon
// from the gauge design below.
//
// Usage (resvg-js isn't a project dependency; install it anywhere):
//   npm install --prefix /tmp/resvg @resvg/resvg-js
//   node scripts/generate-icons.mjs /tmp/resvg/node_modules/@resvg/resvg-js assets
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , resvgPath, outDir] = process.argv;
const { Resvg } = createRequire(import.meta.url)(resvgPath);
mkdirSync(outDir, { recursive: true });

const BG = '#0B0D12';
const BG_LIGHT = '#171C27';
const TRACK = '#2A3242';
const MINT = '#4DF2B0';

const CX = 512;
const CY = 645;
const R = 300;
const SWEEP = 62;

const polar = (deg, r) => {
  const t = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(t), CY - r * Math.cos(t)];
};
const arc = (from, to, r) => {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

/** The gauge mark. `mono` draws everything in one colour (Android themed icons). */
function mark({ mono = false, glow = true } = {}) {
  const track = mono ? '#FFFFFF' : TRACK;
  const accent = mono ? '#FFFFFF' : MINT;
  const ticks = [-25, 25]
    .map((c) => {
      const deg = (c / 50) * SWEEP;
      const [x1, y1] = polar(deg, R - 46);
      const [x2, y2] = polar(deg, R - 86);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${track}" stroke-width="16" stroke-linecap="round" ${mono ? 'opacity="0.6"' : ''}/>`;
    })
    .join('');
  const [nx, ny] = polar(0, R - 64);
  // Starts at the hub's edge so it doesn't show through the hollow monochrome hub.
  const needle = `<line x1="${CX}" y1="${CY - 55}" x2="${nx}" y2="${ny}" stroke="${accent}" stroke-width="34" stroke-linecap="round"/>`;
  return `
    <path d="${arc(-SWEEP, SWEEP, R)}" stroke="${track}" stroke-width="44" stroke-linecap="round" fill="none" ${mono ? 'opacity="0.6"' : ''}/>
    ${ticks}
    <path d="${arc(-9, 9, R)}" stroke="${accent}" stroke-width="44" stroke-linecap="round" fill="none"/>
    ${glow && !mono ? `<g filter="url(#glow)" opacity="0.75"><line x1="${CX}" y1="${CY}" x2="${nx}" y2="${ny}" stroke="${accent}" stroke-width="70" stroke-linecap="round"/><path d="${arc(-9, 9, R)}" stroke="${accent}" stroke-width="70" stroke-linecap="round" fill="none"/></g>` : ''}
    ${needle}
    <circle cx="${CX}" cy="${CY}" r="44" fill="${mono ? 'none' : BG}" stroke="${accent}" stroke-width="22"/>`;
}

const defs = `
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="70%">
      <stop offset="0%" stop-color="${BG_LIGHT}"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
    <filter id="glow" filterUnits="userSpaceOnUse" x="-512" y="-512" width="2048" height="2048">
      <feGaussianBlur stdDeviation="34"/>
    </filter>
  </defs>`;

/** `scale` shrinks the mark about the canvas centre (Android safe zone). */
function svg({ background, scale = 1, mono = false }) {
  const t = `translate(512 512) scale(${scale}) translate(-512 -512)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${defs}
    ${background ? '<rect width="1024" height="1024" fill="url(#bg)"/>' : ''}
    <g transform="${t}">${mark({ mono })}</g>
  </svg>`;
}

function render(name, svgText, size = 1024) {
  const png = new Resvg(svgText, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(outDir, name), png);
  console.log(name, size, png.length, 'bytes');
}

// iOS / default icon: full-bleed and opaque (the OS applies the mask).
render('icon.png', svg({ background: true, scale: 1.2 }));
// Android adaptive icon: transparent foreground kept within the ~61% safe zone.
render('android-icon-foreground.png', svg({ background: false, scale: 0.82 }));
render('android-icon-monochrome.png', svg({ background: false, scale: 0.82, mono: true }));
// Splash: transparent mark on the configured background colour.
render('splash-icon.png', svg({ background: false }));
render('favicon.png', svg({ background: true, scale: 1.2 }), 48);
