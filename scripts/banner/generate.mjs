// Generates the terminal-style profile banner (dark + light SVG) with an
// animated 3-image dithered "VISUAL.MAP" panel.
// Usage: node generate.mjs <img1> <img2> <img3> [outDir]
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [img1, img2, img3, outDir = "../../assets"] = process.argv.slice(2);
if (!img3) {
  console.error("Usage: node generate.mjs <img1> <img2> <img3> [outDir]");
  process.exit(1);
}

// --- Photo -> 1-bit dither -------------------------------------------------
const PW = 300;
const PH = 340;
const ASPECT = PW / PH;

// Each source gets a crop box (left, top, width, height) and a gamma.
const SOURCES = [
  { file: img1, crop: { left: 150, top: 300, width: 1000, height: 1133 }, gamma: 0.7 },
  { file: img2, crop: { left: 0, top: 170, width: 408, height: 462 }, gamma: 0.9 },
  { file: img3, crop: { left: 185, top: 0, width: 365, height: 414 }, gamma: 1.3 },
];

async function dither({ file, crop, gamma }) {
  const { data } = await sharp(file)
    .rotate()
    .extract(crop)
    .resize(PW, PH, { fit: "cover" })
    .greyscale()
    .normalise({ lower: 1, upper: 99 })
    .clahe({ width: 40, height: 40, maxSlope: 3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = Float32Array.from(data, (v) => Math.pow(v / 255, gamma));
  const on = new Uint8Array(PW * PH);
  // Floyd–Steinberg error diffusion.
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const i = y * PW + x;
      const old = px[i];
      const val = old > 0.5 ? 1 : 0;
      on[i] = val;
      const err = old - val;
      if (x + 1 < PW) px[i + 1] += (err * 7) / 16;
      if (y + 1 < PH) {
        if (x > 0) px[i + PW - 1] += (err * 3) / 16;
        px[i + PW] += (err * 5) / 16;
        if (x + 1 < PW) px[i + PW + 1] += (err * 1) / 16;
      }
    }
  }
  return on;
}

// Horizontal runs of on-pixels become one stroked segment each (smaller SVG).
function pathFrom(on) {
  let d = "";
  let n = 0;
  for (let y = 0; y < PH; y++) {
    let x = 0;
    while (x < PW) {
      if (on[y * PW + x] !== 1) { x++; continue; }
      let len = 1;
      while (x + len < PW && on[y * PW + x + len] === 1) len++;
      d += `M${x} ${y + 0.5}h${len}`;
      n += len;
      x += len;
    }
  }
  return { d, n };
}

// --- Theme + layout --------------------------------------------------------
const THEMES = {
  dark: {
    bg: "#0b1220", win: "#0e1729", panel: "#0f1b30", border: "#1c2a44",
    title: "#7b8aa6", head: "#2fd0e8", key: "#8a9ab8", val: "#e8f0ff",
    dots: "#8b7be8", leader: "#1f2d48", ok: "#2ecc71", live: "#e5484d",
    pill: "#16294a", pillText: "#7cc4ff", foot: "#6f7e9c", invert: false,
  },
  light: {
    bg: "#f4f6fb", win: "#ffffff", panel: "#f6f8fd", border: "#d5dcec",
    title: "#6b7790", head: "#0a8aa0", key: "#6b7790", val: "#0f1b30",
    dots: "#4c3fc4", leader: "#d9e0f0", ok: "#1a9e57", live: "#d12f36",
    pill: "#e1ecfb", pillText: "#1d5fa8", foot: "#6b7790", invert: false,
  },
};

const ROWS = [
  ["Subject", "Giorgio"],
  ["Role", "Full-Stack Developer · Jr"],
  ["Origin", "Santa Cruz · Bolivia"],
  ["Status", "Building + Learning + Shipping"],
  ["ToolChain", "VS Code · Git · Docker"],
  ["Core.Lang", "C# · TypeScript · JavaScript"],
  ["Core.Frontend", "Angular · React · Tailwind"],
  ["Core.Backend", ".NET · ASP.NET Core · Node"],
  ["Core.Database", "SQL Server · PostgreSQL · MySQL"],
  ["Core.Infra", "Docker · Linux · Bash"],
  ["Grid.Mail", "gsebas.0702lp@gmail.com"],
  ["Grid.LinkedIn", "/in/giorgio-sebastian-lopez-poiqui"],
  ["Grid.GitHub", "YoryoDev"],
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function buildSvg(name, frames) {
  const t = THEMES[name];
  const W = 900;
  const H = 500;
  const font = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

  const rx = 400; // right panel x
  const rw = 470;
  const rowY0 = 130;
  const rowH = 22.5;
  const rows = ROWS.map(([k, v], i) => {
    const y = rowY0 + i * rowH;
    return `<text x="${rx + 18}" y="${y}" fill="${t.key}" font-size="11.5">${esc(k)}</text>
    <line x1="${rx + 130}" x2="${rx + rw - 18 - v.length * 6.9 - 8}" y1="${y - 4}" y2="${y - 4}" stroke="${t.leader}" stroke-dasharray="1 3"/>
    <text x="${rx + rw - 18}" y="${y}" fill="${t.val}" font-size="11.5" font-weight="600" text-anchor="end">${esc(v)}</text>`;
  }).join("\n    ");

  // Cycle through the frames: each is fully visible for ~1/N of the loop and
  // cross-fades into the next one.
  const N = frames.length;
  const DUR = N * 4; // seconds per full loop
  const fade = 0.04 / (N / 3);
  const layers = frames.map((f, i) => {
    const s = i / N;
    const e = (i + 1) / N;
    const kt = [];
    const vals = [];
    const push = (k, v) => { kt.push(k.toFixed(4)); vals.push(v); };
    if (i === 0) {
      push(0, 1); push(e - fade, 1); push(e, 0); push(1 - fade, 0); push(1, 1);
    } else if (i === N - 1) {
      push(0, 0); push(s - fade, 0); push(s, 1); push(1 - fade, 1); push(1, 0);
    } else {
      push(0, 0); push(s - fade, 0); push(s, 1); push(e - fade, 1); push(e, 0); push(1, 0);
    }
    return `<g opacity="${i === 0 ? 1 : 0}">
        <animate attributeName="opacity" dur="${DUR}s" repeatCount="indefinite" keyTimes="${kt.join(";")}" values="${vals.join(";")}"/>
        <path d="${f.d}" stroke="${t.dots}" stroke-width="1" fill="none"/>
        <text x="-8" y="${PH + 34}" fill="${t.foot}" font-size="9.5">PTS ${f.n} · FS/SERPENTINE</text>
        <text x="${PW + 8}" y="${PH + 34}" fill="${t.foot}" font-size="9.5" text-anchor="end">SRC ${i + 1}/${N}</text>
      </g>`;
  }).join("\n      ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="profile.sh --live">
  <title>profile.sh --live</title>
  <g font-family="${font}">
    <rect width="${W}" height="${H}" rx="12" fill="${t.bg}"/>
    <rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="10" fill="${t.win}" stroke="${t.border}"/>
    <circle cx="34" cy="32" r="6" fill="#ff5f57"/><circle cx="54" cy="32" r="6" fill="#febc2e"/><circle cx="74" cy="32" r="6" fill="#28c840"/>
    <text x="${W / 2}" y="36" fill="${t.title}" font-size="11" text-anchor="middle">profile.sh --live</text>

    <rect x="28" y="56" width="345" height="${H - 84}" rx="6" fill="${t.panel}" stroke="${t.border}"/>
    <text x="42" y="78" fill="${t.head}" font-size="11" font-weight="700" letter-spacing="1">VISUAL.MAP</text>
    <text x="359" y="78" fill="${t.foot}" font-size="10" text-anchor="end">${PW}×${PH} / 1-BIT</text>
    <g transform="translate(50 92)">
      ${layers}
    </g>

    <rect x="${rx - 10}" y="56" width="${rw + 10}" height="${H - 84}" rx="6" fill="${t.panel}" stroke="${t.border}"/>
    <text x="${rx + 8}" y="78" fill="${t.head}" font-size="11" font-weight="700" letter-spacing="1">SYSTEM.INFO</text>
    <circle cx="${rx + rw - 150}" cy="74" r="3.5" fill="${t.live}"><animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite"/></circle>
    <text x="${rx + rw - 142}" y="78" fill="${t.live}" font-size="10" font-weight="700">LIVE</text>
    <rect x="${rx + rw - 100}" y="63" width="92" height="22" rx="11" fill="${t.pill}"/>
    <text x="${rx + rw - 54}" y="78" fill="${t.pillText}" font-size="11" font-weight="700" text-anchor="middle">@YoryoDev</text>
    <line x1="${rx - 10}" x2="${rx + rw}" y1="96" y2="96" stroke="${t.border}"/>
    ${rows}
    <line x1="${rx - 10}" x2="${rx + rw}" y1="${H - 52}" y2="${H - 52}" stroke="${t.border}"/>
    <circle cx="${rx + 8}" cy="${H - 38}" r="3" fill="${t.ok}"/>
    <text x="${rx + 18}" y="${H - 34}" fill="${t.ok}" font-size="9.5" font-weight="700">ALL SYSTEMS NOMINAL</text>
    <text x="${rx + rw - 18}" y="${H - 34}" fill="${t.foot}" font-size="9.5" text-anchor="end">UTC-4 · LATAM NODE</text>
  </g>
</svg>
`;
}

const frames = [];
for (const src of SOURCES) frames.push(pathFrom(await dither(src)));

const out = resolve(outDir);
mkdirSync(out, { recursive: true });
for (const name of ["dark", "light"]) {
  const svg = buildSvg(name, frames);
  const file = resolve(out, `banner-${name}.svg`);
  writeFileSync(file, svg);
  console.log(`${file}  ${(svg.length / 1024).toFixed(0)} KB  pts ${frames.map((f) => f.n).join("/")}`);
}
