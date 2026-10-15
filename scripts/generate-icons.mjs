// Renders the app icon, Android adaptive icon layers, splash image and favicon
// from the gauge design below: a mint needle pointing into the in-tune zone of
// a grey arc, on a flat dark background.
//
// Usage (resvg-js isn't a project dependency; install it anywhere):
//   npm install --prefix /tmp/resvg @resvg/resvg-js
//   node scripts/generate-icons.mjs /tmp/resvg/node_modules/@resvg/resvg-js assets [store]
// With a third argument it also renders the Google Play graphics there.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [, , resvgPath, outDir, storeDir] = process.argv;
const { Resvg } = createRequire(import.meta.url)(resvgPath);
mkdirSync(outDir, { recursive: true });

/** Flat icon background; also the adaptive icon's backgroundColor in app.json. */
const BG = '#0F131B';
const TRACK = '#6B7690';
const MINT = '#4DF2B0';

// The gauge in its own coordinates: pivot at (CX, CY), arc of radius R.
const CX = 512;
const CY = 640;
const R = 380;
const SWEEP = 62;
const ZONE = 11;
const STROKE = 78;
/** Vertical middle of the drawn gauge (arc top to hub bottom), used to centre it. */
const MIDDLE = 464;
/** Size of the gauge on the visible icon (1 = as drawn above). */
const SIZE = 1.15;

const polar = (deg, r) => {
  const t = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(t), CY - r * Math.cos(t)];
};
const arc = (from, to, r) => {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

/** The gauge. `mono` draws it in one colour for Android themed icons. */
function gauge({ mono = false } = {}) {
  const track = mono ? '#FFFFFF' : TRACK;
  const accent = mono ? '#FFFFFF' : MINT;
  const [nx, ny] = polar(0, R - 70);
  // In one colour the hub is a hollow ring, so the needle starts at its edge
  // rather than poking into the hole.
  const needleStart = mono ? CY - 67 : CY - 40;
  return `
    <path d="${arc(-SWEEP, SWEEP, R)}" stroke="${track}" stroke-width="${STROKE}" stroke-linecap="round" fill="none" ${mono ? 'opacity="0.6"' : ''}/>
    <path d="${arc(-ZONE, ZONE, R)}" stroke="${accent}" stroke-width="${STROKE}" stroke-linecap="round" fill="none"/>
    <line x1="${CX}" y1="${needleStart}" x2="${nx}" y2="${ny}" stroke="${accent}" stroke-width="56" stroke-linecap="round"/>
    <circle cx="${CX}" cy="${CY}" r="52" fill="${mono ? 'none' : BG}" stroke="${accent}" stroke-width="30"/>`;
}

/**
 * A 1024×1024 image with the gauge centred and scaled by `scale`.
 * Full-bleed icons use SIZE. Android adaptive layers are 108dp of which only
 * the middle 72dp shows, so the gauge is scaled by 72/108 to look the same.
 */
function svg({ background, scale, mono = false }) {
  const t = `translate(512 512) scale(${scale}) translate(-512 -${MIDDLE})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    ${background ? `<rect width="1024" height="1024" fill="${BG}"/>` : ''}
    <g transform="${t}">${gauge({ mono })}</g>
  </svg>`;
}

function render(name, svgText, size = 1024, dir = outDir) {
  const png = new Resvg(svgText, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(dir, name), png);
  console.log(name, size, png.length, 'bytes');
}

// A little smaller on the adaptive layer: the arc's rounded ends point down and
// would otherwise touch the edge of Android's 66dp safe zone.
const ADAPTIVE = SIZE * (72 / 108) * 0.94;

// iOS / default icon: full-bleed and opaque (the OS applies the mask).
render('icon.png', svg({ background: true, scale: SIZE }));
// Android adaptive icon: transparent foreground on the BG background colour.
render('android-icon-foreground.png', svg({ background: false, scale: ADAPTIVE }));
render('android-icon-monochrome.png', svg({ background: false, scale: ADAPTIVE, mono: true }));
// Splash: transparent gauge on the app's background colour.
render('splash-icon.png', svg({ background: false, scale: SIZE }));
render('favicon.png', svg({ background: true, scale: SIZE }), 48);

if (storeDir) {
  mkdirSync(storeDir, { recursive: true });
  // Google Play listing icon: 512×512, full-bleed (Play applies its own mask).
  render('play-icon-512.png', svg({ background: true, scale: SIZE }), 512, storeDir);
  // Feature graphic: 1024×500, the gauge on the left and the name on the right.
  const font = 'Helvetica Neue, Helvetica, Arial, sans-serif';
  const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
    <rect width="1024" height="500" fill="${BG}"/>
    <g transform="translate(290 250) scale(0.5) translate(-512 -${MIDDLE})">${gauge()}</g>
    <text x="560" y="232" fill="#F4F6FB" font-family="${font}" font-size="104" font-weight="800" letter-spacing="-3">Tuner</text>
    <text x="564" y="292" fill="#9AA3B5" font-family="${font}" font-size="30" font-weight="600">Guitar · Bass · Ukulele</text>
    <text x="564" y="340" fill="${MINT}" font-family="${font}" font-size="30" font-weight="600">Tune and name your chords</text>
  </svg>`;
  render('feature-graphic.png', feature, 1024, storeDir);
}
