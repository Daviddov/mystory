/**
 * Tiny hand-drawn SVG kit for the seeded sample books. Every helper returns an
 * SVG fragment drawn around its own origin; g() places and scales it.
 */

export const W = 800;
export const H = 600;

const INK = "#3B2F2A";

export function g(x: number, y: number, s: number, inner: string, extra = ""): string {
  return `<g transform="translate(${x} ${y}) scale(${s})${extra}">${inner}</g>`;
}

export function flip(inner: string): string {
  return `<g transform="scale(-1 1)">${inner}</g>`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

export function scene(body: string, label: string, width = W, height = H): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(label)}">` +
    `<g stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>\n`
  );
}

// --- Backgrounds -------------------------------------------------------------

let gradientCounter = 0;

export function sky(top: string, bottom: string, width = W, height = H): string {
  const id = `sky${gradientCounter++}`;
  return (
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>` +
    `<rect width="${width}" height="${height}" fill="url(#${id})"/>`
  );
}

export const daySky = (w = W, h = H) => sky("#BFE6FF", "#EAF7FF", w, h);
export const morningSky = (w = W, h = H) => sky("#FFE2B8", "#FFF5DC", w, h);
export const eveningSky = (w = W, h = H) => sky("#FFB38A", "#FFE0A8", w, h);
export const nightSky = (w = W, h = H) => sky("#1B2350", "#3A3F7A", w, h);
export const greySky = (w = W, h = H) => sky("#9FB0C4", "#D5DEE8", w, h);

export function ground(y: number, color = "#8FD08A", width = W, height = H): string {
  return `<path d="M0 ${y} Q ${width * 0.25} ${y - 26} ${width * 0.5} ${y} T ${width} ${y - 6} V ${height} H 0 Z" fill="${color}"/>`;
}

export function hills(y: number, color = "#A9DDA0", width = W, height = H): string {
  return `<path d="M0 ${y} Q ${width * 0.2} ${y - 90} ${width * 0.42} ${y - 10} T ${width * 0.8} ${y - 30} T ${width} ${y - 50} V ${height} H 0 Z" fill="${color}"/>`;
}

export function floor(y: number, color = "#E9C99A", wall = "#FFF0D6"): string {
  return `<rect width="${W}" height="${H}" fill="${wall}"/><rect y="${y}" width="${W}" height="${H - y}" fill="${color}"/><rect y="${y - 8}" width="${W}" height="8" fill="#D2AE7C"/>`;
}

export function sun(x: number, y: number, r = 50, color = "#FFC93C"): string {
  let rays = "";
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    rays += `<line x1="${(Math.cos(a) * (r + 12)).toFixed(1)}" y1="${(Math.sin(a) * (r + 12)).toFixed(1)}" x2="${(Math.cos(a) * (r + 30)).toFixed(1)}" y2="${(Math.sin(a) * (r + 30)).toFixed(1)}" stroke="${color}" stroke-width="7"/>`;
  }
  return g(x, y, 1, `${rays}<circle r="${r}" fill="${color}"/>`);
}

export function cloud(x: number, y: number, s = 1, color = "#FFFFFF", opacity = 0.95): string {
  return g(
    x,
    y,
    s,
    `<g fill="${color}" opacity="${opacity}"><ellipse cx="0" cy="0" rx="60" ry="26"/><ellipse cx="-34" cy="-18" rx="34" ry="26"/><ellipse cx="18" cy="-26" rx="40" ry="32"/><ellipse cx="50" cy="-6" rx="30" ry="20"/></g>`,
  );
}

export function stars(points: Array<[number, number, number?]>, color = "#FFF3B0"): string {
  return points
    .map(([x, y, r = 3]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`)
    .join("");
}

export const NIGHT_STARS: Array<[number, number, number?]> = [
  [60, 70], [150, 150, 2], [240, 60, 4], [330, 130, 2], [470, 50], [560, 140, 2], [650, 70, 4], [740, 160],
  [100, 230, 2], [700, 260, 2], [410, 190, 2], [520, 250, 3], [30, 320, 2], [770, 60, 2],
];

export function rain(color = "#6FA8DC", count = 26): string {
  let drops = "";
  for (let i = 0; i < count; i++) {
    const x = (i * 97) % W;
    const y = (i * 173) % 430;
    drops += `<line x1="${x}" y1="${y}" x2="${x - 8}" y2="${y + 24}" stroke="${color}" stroke-width="4" opacity="0.8"/>`;
  }
  return drops;
}

// --- Plants and places -----------------------------------------------------------

export function tree(x: number, y: number, s = 1, crown = "#5DB075", trunk = "#9B6B43"): string {
  return g(
    x,
    y,
    s,
    `<rect x="-16" y="-110" width="32" height="110" rx="10" fill="${trunk}"/>` +
      `<g fill="${crown}"><circle cx="0" cy="-160" r="70"/><circle cx="-55" cy="-125" r="48"/><circle cx="55" cy="-125" r="48"/></g>` +
      `<g fill="#FFFFFF" opacity="0.18"><circle cx="-20" cy="-185" r="22"/></g>`,
  );
}

export function figTree(x: number, y: number, s = 1): string {
  const leaf = (lx: number, ly: number) =>
    `<path d="M${lx} ${ly} q -18 -26 0 -44 q 18 18 0 44 M${lx} ${ly} q -34 -8 -36 -32 q 26 2 36 32 M${lx} ${ly} q 34 -8 36 -32 q -26 2 -36 32" fill="#3F9B5A"/>`;
  return g(
    x,
    y,
    s,
    `<path d="M-26 0 Q -20 -70 -40 -120 L -10 -130 Q 0 -90 10 -130 L 44 -116 Q 20 -70 28 0 Z" fill="#8A6748"/>` +
      `<g fill="#4FAE6A"><ellipse cx="0" cy="-190" rx="130" ry="80"/><ellipse cx="-90" cy="-150" rx="60" ry="46"/><ellipse cx="96" cy="-150" rx="60" ry="46"/></g>` +
      leaf(-60, -170) + leaf(20, -200) + leaf(80, -150) + leaf(-10, -130) +
      `<g fill="#7B4B9A"><ellipse cx="-36" cy="-120" rx="9" ry="12"/><ellipse cx="50" cy="-112" rx="9" ry="12"/></g>`,
  );
}

export function flower(x: number, y: number, s = 1, petals = "#FF8FA3", center = "#FFD45E"): string {
  let p = "";
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    p += `<circle cx="${(Math.cos(a) * 20).toFixed(1)}" cy="${(-70 + Math.sin(a) * 20).toFixed(1)}" r="14" fill="${petals}"/>`;
  }
  return g(
    x,
    y,
    s,
    `<path d="M0 0 Q 6 -30 0 -60" stroke="#4E9F5B" stroke-width="7" fill="none"/><ellipse cx="16" cy="-24" rx="16" ry="7" fill="#6CC077" transform="rotate(-25 16 -24)"/>${p}<circle cx="0" cy="-70" r="13" fill="${center}"/>`,
  );
}

export function grass(x: number, y: number, width: number, color = "#5DB075"): string {
  let blades = "";
  for (let i = 0; i <= width; i += 14) {
    const h = 26 + ((i * 7) % 22);
    blades += `<path d="M${x + i} ${y} q ${((i % 3) - 1) * 6} ${-h / 2} ${((i % 5) - 2) * 4} ${-h}" stroke="${color}" stroke-width="6" fill="none"/>`;
  }
  return blades;
}

export function bigLeaf(x: number, y: number, s = 1, color = "#6CC077"): string {
  return g(
    x,
    y,
    s,
    `<path d="M-110 0 Q -40 -90 110 -20 Q 20 40 -110 0 Z" fill="${color}"/><path d="M-100 -2 Q 0 -30 100 -20" stroke="#4E9F5B" stroke-width="5" fill="none"/>`,
  );
}

export function puddle(x: number, y: number, s = 1, color = "#8EC9F0"): string {
  return g(
    x,
    y,
    s,
    `<ellipse rx="110" ry="26" fill="${color}"/><ellipse cx="-30" cy="-6" rx="34" ry="6" fill="#FFFFFF" opacity="0.5"/>`,
  );
}

export function splash(x: number, y: number, s = 1, color = "#8EC9F0"): string {
  return g(
    x,
    y,
    s,
    `<g fill="${color}"><path d="M-70 0 q -30 -50 -50 -70 q 40 10 62 62 Z"/><path d="M70 0 q 30 -50 50 -70 q -40 10 -62 62 Z"/><circle cx="-90" cy="-90" r="9"/><circle cx="96" cy="-96" r="9"/><circle cx="-40" cy="-80" r="7"/><circle cx="36" cy="-84" r="7"/><circle cx="0" cy="-104" r="8"/></g>`,
  );
}

export function house(x: number, y: number, s = 1, lit = false, wall = "#FFE2B8", roof = "#E0694A"): string {
  const windowFill = lit ? "#FFE066" : "#BFE6FF";
  return g(
    x,
    y,
    s,
    `<rect x="-90" y="-120" width="180" height="120" rx="8" fill="${wall}"/>` +
      `<path d="M-110 -116 L 0 -200 L 110 -116 Z" fill="${roof}"/>` +
      `<rect x="-20" y="-70" width="40" height="70" rx="6" fill="#9B6B43"/><circle cx="10" cy="-34" r="4" fill="#FFD45E"/>` +
      `<rect x="34" y="-96" width="40" height="40" rx="6" fill="${windowFill}" stroke="#9B6B43" stroke-width="5"/>` +
      `<rect x="-74" y="-96" width="40" height="40" rx="6" fill="${windowFill}" stroke="#9B6B43" stroke-width="5"/>` +
      (lit ? `<circle cx="54" cy="-76" r="50" fill="#FFE066" opacity="0.18"/>` : ""),
  );
}

export function building(x: number, y: number, w: number, h: number, color = "#E8D2B0"): string {
  let windows = "";
  for (let row = 0; row < Math.floor(h / 70); row++) {
    for (let col = 0; col < Math.floor(w / 60); col++) {
      windows += `<rect x="${x + 16 + col * 60}" y="${y - h + 20 + row * 70}" width="30" height="40" rx="4" fill="#BFE6FF" opacity="0.9"/>`;
    }
  }
  return `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${color}"/>${windows}`;
}

export function stoneWall(y: number, h: number, highlight?: [number, number]): string {
  let stones = `<rect x="0" y="${y}" width="${W}" height="${h}" fill="#C9B79C"/>`;
  const sw = 100;
  const sh = 50;
  for (let row = 0; row * sh < h; row++) {
    for (let col = -1; col * sw < W; col++) {
      const sx = col * sw + (row % 2) * 50;
      const sy = y + row * sh;
      const lit = highlight && highlight[0] === col && highlight[1] === row;
      stones += `<rect x="${sx + 3}" y="${sy + 3}" width="${sw - 6}" height="${sh - 6}" rx="8" fill="${lit ? "#FFE8A3" : (row + col) % 3 === 0 ? "#BBA789" : "#D6C6AC"}"/>`;
    }
  }
  return stones;
}

export function fountain(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<path d="M0 -150 q -50 30 -60 90 M0 -150 q 50 30 60 90 M0 -150 v 80" stroke="#8EC9F0" stroke-width="8" fill="none"/>` +
      `<rect x="-14" y="-90" width="28" height="60" fill="#B9B4AA"/><ellipse cx="0" cy="-90" rx="46" ry="12" fill="#CFCAC0"/>` +
      `<ellipse cx="0" cy="-34" rx="130" ry="22" fill="#8EC9F0"/>` +
      `<path d="M-130 -34 v 30 q 130 34 260 0 v -30 q -130 34 -260 0 Z" fill="#A89C8A"/>` +
      `<g fill="#8C7F6C"><rect x="-110" y="-10" width="40" height="18" rx="4"/><rect x="-60" y="-2" width="40" height="18" rx="4"/><rect x="-10" y="0" width="40" height="18" rx="4"/><rect x="40" y="-2" width="40" height="18" rx="4"/></g>`,
  );
}

export function bench(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<rect x="-90" y="-50" width="180" height="14" rx="6" fill="#9B6B43"/><rect x="-90" y="-90" width="180" height="12" rx="6" fill="#9B6B43"/><rect x="-90" y="-70" width="180" height="12" rx="6" fill="#B07F52"/><rect x="-80" y="-40" width="12" height="40" fill="#7A5232"/><rect x="68" y="-40" width="12" height="40" fill="#7A5232"/>`,
  );
}

export function mushroom(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<path d="M-30 0 Q -36 -70 -22 -90 H 22 Q 36 -70 30 0 Z" fill="#FFF0D6"/>` +
      `<path d="M-110 -86 Q 0 -230 110 -86 Q 0 -66 -110 -86 Z" fill="#E0554A"/>` +
      `<g fill="#FFFFFF"><circle cx="-50" cy="-120" r="14"/><circle cx="10" cy="-150" r="18"/><circle cx="56" cy="-112" r="12"/></g>`,
  );
}

export function balloon(x: number, y: number, s = 1, color = "#FF8FA3", stringLength = 90): string {
  return g(
    x,
    y,
    s,
    `<path d="M0 0 q 10 ${stringLength / 2} 0 ${stringLength}" stroke="${INK}" stroke-width="2" fill="none"/><ellipse cx="0" cy="-36" rx="28" ry="36" fill="${color}"/><ellipse cx="-9" cy="-48" rx="6" ry="10" fill="#FFFFFF" opacity="0.5"/>`,
  );
}

export function cake(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<rect x="-50" y="-50" width="100" height="50" rx="10" fill="#F7C6A3"/><path d="M-50 -40 q 12 20 25 0 q 12 20 25 0 q 12 20 25 0 q 12 20 25 0 v -10 h -100 Z" fill="#FF8FA3"/><rect x="-4" y="-78" width="8" height="28" fill="#8EC9F0"/><path d="M0 -92 q 8 10 0 16 q -8 -6 0 -16 Z" fill="#FFC93C"/>`,
  );
}

export function gift(x: number, y: number, s = 1, color = "#8EC9F0"): string {
  return g(
    x,
    y,
    s,
    `<rect x="-22" y="-36" width="44" height="36" rx="5" fill="${color}"/><rect x="-5" y="-36" width="10" height="36" fill="#FF8FA3"/><path d="M0 -36 q -18 -22 -20 -4 q 8 6 20 4 q 18 -22 20 -4 q -8 6 -20 4" fill="#FF8FA3"/>`,
  );
}

export function fireflies(points: Array<[number, number]>): string {
  return points
    .map(
      ([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="16" fill="#FFF3B0" opacity="0.25"/><circle cx="${x}" cy="${y}" r="6" fill="#FFF3B0"/>`,
    )
    .join("");
}

// --- Faces ---------------------------------------------------------------------------

type Mood = "smile" | "sad" | "wow" | "sleep" | "laugh" | "flat";

function face(mood: Mood, eyeDx = 12, eyeY = 0, r = 4.5): string {
  const eyes =
    mood === "sleep"
      ? `<path d="M${-eyeDx - 6} ${eyeY} q 6 6 12 0 M${eyeDx - 6} ${eyeY} q 6 6 12 0" stroke="${INK}" stroke-width="3" fill="none"/>`
      : mood === "laugh"
        ? `<path d="M${-eyeDx - 6} ${eyeY + 2} q 6 -8 12 0 M${eyeDx - 6} ${eyeY + 2} q 6 -8 12 0" stroke="${INK}" stroke-width="3" fill="none"/>`
        : `<circle cx="${-eyeDx}" cy="${eyeY}" r="${r}" fill="${INK}"/><circle cx="${eyeDx}" cy="${eyeY}" r="${r}" fill="${INK}"/>`;
  const my = eyeY + 14;
  const mouth =
    mood === "smile" || mood === "sleep"
      ? `<path d="M-9 ${my} q 9 9 18 0" stroke="${INK}" stroke-width="3" fill="none"/>`
      : mood === "sad"
        ? `<path d="M-9 ${my + 6} q 9 -9 18 0" stroke="${INK}" stroke-width="3" fill="none"/>`
        : mood === "wow"
          ? `<ellipse cx="0" cy="${my + 3}" rx="6" ry="8" fill="${INK}"/>`
          : mood === "laugh"
            ? `<path d="M-12 ${my - 2} q 12 20 24 0 Z" fill="${INK}"/>`
            : `<line x1="-8" y1="${my + 2}" x2="8" y2="${my + 2}" stroke="${INK}" stroke-width="3"/>`;
  return eyes + mouth;
}

const cheeks = (dx: number, y: number) =>
  `<circle cx="${-dx}" cy="${y}" r="7" fill="#FF8FA3" opacity="0.55"/><circle cx="${dx}" cy="${y}" r="7" fill="#FF8FA3" opacity="0.55"/>`;

// --- Small animals ------------------------------------------------------------------------

export function snail(x: number, y: number, s = 1, mood: Mood = "smile", shell = "#F2A65A"): string {
  return g(
    x,
    y,
    s,
    `<path d="M-90 0 Q -96 -24 -60 -26 H 50 Q 84 -30 86 -70 Q 110 -70 104 -30 Q 100 0 60 0 Z" fill="#F6D7A8"/>` +
      `<circle cx="-18" cy="-58" r="56" fill="${shell}"/><path d="M-18 -58 m 0 -36 a 36 36 0 1 0 36 36 a 24 24 0 1 0 -24 24 a 12 12 0 1 0 -12 -12" stroke="#C97B32" stroke-width="6" fill="none"/>` +
      `<line x1="88" y1="-70" x2="80" y2="-108" stroke="#F6D7A8" stroke-width="6"/><line x1="100" y1="-68" x2="110" y2="-104" stroke="#F6D7A8" stroke-width="6"/><circle cx="80" cy="-110" r="7" fill="#F6D7A8"/><circle cx="110" cy="-106" r="7" fill="#F6D7A8"/>` +
      g(92, -52, 0.7, face(mood, 9, 0, 4)),
  );
}

export function ladybug(x: number, y: number, s = 1, mood: Mood = "smile"): string {
  return g(
    x,
    y,
    s,
    `<g stroke="${INK}" stroke-width="4"><line x1="-30" y1="-6" x2="-44" y2="8"/><line x1="0" y1="-2" x2="0" y2="12"/><line x1="30" y1="-6" x2="44" y2="8"/></g>` +
      `<path d="M-50 -10 A 50 46 0 0 1 50 -10 Z" fill="#E0463C"/><line x1="0" y1="-56" x2="0" y2="-10" stroke="${INK}" stroke-width="3"/>` +
      `<g fill="${INK}"><circle cx="-24" cy="-32" r="7"/><circle cx="22" cy="-36" r="7"/><circle cx="-10" cy="-18" r="5"/><circle cx="30" cy="-18" r="5"/></g>` +
      `<circle cx="58" cy="-22" r="20" fill="${INK}"/><line x1="64" y1="-40" x2="72" y2="-58" stroke="${INK}" stroke-width="3"/><line x1="54" y1="-40" x2="50" y2="-60" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="54" cy="-26" r="5" fill="#FFFFFF"/><circle cx="68" cy="-26" r="5" fill="#FFFFFF"/>` +
      (mood === "smile" || mood === "laugh"
        ? `<path d="M54 -14 q 7 6 14 0" stroke="#FFFFFF" stroke-width="2.5" fill="none"/>`
        : ""),
  );
}

export function frog(x: number, y: number, s = 1, mood: Mood = "smile"): string {
  return g(
    x,
    y,
    s,
    `<ellipse cx="0" cy="-30" rx="60" ry="40" fill="#6CC077"/><ellipse cx="0" cy="-20" rx="38" ry="24" fill="#B9E6A8"/>` +
      `<g fill="#4E9F5B"><ellipse cx="-50" cy="-4" rx="26" ry="10"/><ellipse cx="50" cy="-4" rx="26" ry="10"/></g>` +
      `<circle cx="-28" cy="-70" r="20" fill="#6CC077"/><circle cx="28" cy="-70" r="20" fill="#6CC077"/><circle cx="-28" cy="-72" r="11" fill="#FFFFFF"/><circle cx="28" cy="-72" r="11" fill="#FFFFFF"/><circle cx="-26" cy="-72" r="5" fill="${INK}"/><circle cx="30" cy="-72" r="5" fill="${INK}"/>` +
      (mood === "wow"
        ? `<ellipse cx="0" cy="-40" rx="10" ry="8" fill="${INK}"/>`
        : `<path d="M-28 -46 q 28 22 56 0" stroke="${INK}" stroke-width="4" fill="none"/>`),
  );
}

export function bird(x: number, y: number, s = 1, color = "#5AA9E6"): string {
  return g(
    x,
    y,
    s,
    `<line x1="-8" y1="0" x2="-8" y2="16" stroke="#E08A3C" stroke-width="4"/><line x1="10" y1="0" x2="10" y2="16" stroke="#E08A3C" stroke-width="4"/>` +
      `<path d="M-70 -40 L -40 -32 L -44 -10 Z" fill="${color}"/><ellipse cx="0" cy="-30" rx="46" ry="34" fill="${color}"/><ellipse cx="-6" cy="-24" rx="24" ry="16" fill="#3D8BD0"/>` +
      `<circle cx="34" cy="-56" r="24" fill="${color}"/><path d="M54 -58 l 24 6 l -24 8 Z" fill="#F2A65A"/><circle cx="40" cy="-60" r="5" fill="${INK}"/>`,
  );
}

export function kitten(x: number, y: number, s = 1, mood: Mood = "smile", fur = "#F2B46E"): string {
  return g(
    x,
    y,
    s,
    `<path d="M-60 -10 q -40 -10 -34 -60" stroke="${fur}" stroke-width="14" fill="none"/>` +
      `<ellipse cx="0" cy="-34" rx="56" ry="38" fill="${fur}"/>` +
      `<path d="M10 -96 l 8 -34 l 22 24 Z M70 -96 l 4 -34 l -24 22 Z" fill="${fur}"/><circle cx="42" cy="-78" r="38" fill="${fur}"/>` +
      `<path d="M39 -72 l 6 0 l -3 5 Z" fill="#E8798A"/>` +
      g(42, -84, 1, face(mood, 14, 0, 4.5)) +
      `<g stroke="${INK}" stroke-width="2"><line x1="58" y1="-70" x2="84" y2="-74"/><line x1="58" y1="-64" x2="84" y2="-60"/><line x1="26" y1="-70" x2="0" y2="-74"/><line x1="26" y1="-64" x2="0" y2="-60"/></g>` +
      `<g fill="#FFFFFF"><ellipse cx="-26" cy="-2" rx="14" ry="8"/><ellipse cx="22" cy="-2" rx="14" ry="8"/></g>`,
  );
}

export function sleepingCat(x: number, y: number, s = 1, fur = "#8D8D99"): string {
  return g(
    x,
    y,
    s,
    `<ellipse cx="0" cy="-22" rx="62" ry="26" fill="${fur}"/><path d="M-58 -16 q -30 4 -20 -26" stroke="${fur}" stroke-width="12" fill="none"/>` +
      `<circle cx="44" cy="-30" r="26" fill="${fur}"/><path d="M26 -46 l 2 -22 l 16 14 Z M62 -46 l 2 -22 l -18 14 Z" fill="${fur}"/>` +
      g(44, -32, 0.8, face("sleep", 11, 0)),
  );
}

export function ant(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<g stroke="${INK}" stroke-width="3"><line x1="-16" y1="-8" x2="-24" y2="6"/><line x1="0" y1="-8" x2="0" y2="6"/><line x1="16" y1="-8" x2="24" y2="6"/><line x1="34" y1="-28" x2="46" y2="-44"/><line x1="28" y1="-30" x2="30" y2="-48"/></g>` +
      `<g fill="#5B3A29"><ellipse cx="-22" cy="-14" rx="16" ry="12"/><circle cx="0" cy="-14" r="10"/><circle cx="24" cy="-20" r="13"/></g><circle cx="28" cy="-22" r="3" fill="#FFFFFF"/>`,
  );
}

export function crumb(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<path d="M-40 0 l -8 -34 l 24 -26 l 40 -4 l 28 26 l -6 38 Z" fill="#E9C48A"/><g fill="#C99B5A"><circle cx="-10" cy="-30" r="5"/><circle cx="14" cy="-16" r="4"/><circle cx="10" cy="-44" r="4"/></g>`,
  );
}

export function butterfly(x: number, y: number, s = 1, wing = "#C59CF0", wet = false): string {
  return g(
    x,
    y,
    s,
    `<g fill="${wing}" opacity="${wet ? 0.75 : 1}"><ellipse cx="-24" cy="-22" rx="26" ry="20"/><ellipse cx="24" cy="-22" rx="26" ry="20"/><ellipse cx="-18" cy="10" rx="18" ry="14"/><ellipse cx="18" cy="10" rx="18" ry="14"/></g>` +
      `<ellipse cx="0" cy="-6" rx="6" ry="26" fill="${INK}"/><path d="M-2 -30 q -10 -16 -16 -14 M2 -30 q 10 -16 16 -14" stroke="${INK}" stroke-width="2.5" fill="none"/>` +
      (wet ? `<g fill="#8EC9F0"><circle cx="-40" cy="14" r="4"/><circle cx="38" cy="20" r="4"/></g>` : ""),
  );
}

export function owl(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<ellipse cx="0" cy="-50" rx="46" ry="54" fill="#A9825A"/><ellipse cx="0" cy="-36" rx="28" ry="32" fill="#E9D2B0"/>` +
      `<path d="M-40 -92 l 6 -24 l 20 18 Z M40 -92 l -6 -24 l -20 18 Z" fill="#A9825A"/>` +
      `<circle cx="-18" cy="-70" r="17" fill="#FFFFFF"/><circle cx="18" cy="-70" r="17" fill="#FFFFFF"/><circle cx="-18" cy="-70" r="8" fill="${INK}"/><circle cx="18" cy="-70" r="8" fill="${INK}"/>` +
      `<path d="M-7 -58 l 14 0 l -7 12 Z" fill="#F2A65A"/><g stroke="#F2A65A" stroke-width="4"><line x1="-14" y1="2" x2="-14" y2="10"/><line x1="14" y1="2" x2="14" y2="10"/></g>`,
  );
}

// --- Sky characters ---------------------------------------------------------------------------

export function starChar(x: number, y: number, s = 1, mood: Mood = "smile", color = "#FFD45E"): string {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 70 : 34;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i === 0 ? "M" : "L"}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)} `;
  }
  return g(
    x,
    y,
    s,
    `<circle r="92" fill="${color}" opacity="0.18"/><path d="${d}Z" fill="${color}" stroke="${color}" stroke-width="16"/>` +
      cheeks(22, 12) +
      face(mood, 14, -4),
  );
}

export function moonChar(x: number, y: number, s = 1, mood: Mood = "smile"): string {
  return g(
    x,
    y,
    s,
    `<circle r="100" fill="#FFF3B0" opacity="0.15"/><circle r="74" fill="#FFF1B8"/><g fill="#F2DE8F"><circle cx="-30" cy="-34" r="12"/><circle cx="34" cy="26" r="9"/><circle cx="-36" cy="30" r="7"/></g>` +
      cheeks(30, 14) +
      face(mood, 20, -6, 5),
  );
}

export function sea(y: number, color = "#2F4C8C"): string {
  return (
    `<path d="M0 ${y} q 50 -18 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 V ${H} H 0 Z" fill="${color}"/>` +
    `<path d="M0 ${y + 50} q 50 -14 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0" stroke="#5B79BD" stroke-width="5" fill="none" opacity="0.7"/>` +
    `<path d="M40 ${y + 100} q 50 -14 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0 t 100 0" stroke="#5B79BD" stroke-width="5" fill="none" opacity="0.5"/>`
  );
}

// --- People ----------------------------------------------------------------------------------------

export interface PersonOptions {
  shirt?: string;
  pants?: string;
  hair?: string;
  skin?: string;
  /** 'short' | 'long' | 'pigtails' | 'bun' (grandma) */
  hairStyle?: "short" | "long" | "pigtails" | "bun";
  mood?: Mood;
  boots?: string;
  glasses?: boolean;
  /** Arms raised in joy. */
  cheer?: boolean;
}

/** A standing child about 230 units tall; the origin is between the feet. */
export function person(x: number, y: number, s = 1, o: PersonOptions = {}): string {
  const shirt = o.shirt ?? "#5AA9E6";
  const pants = o.pants ?? "#4B5D8A";
  const hair = o.hair ?? "#5B3A29";
  const skin = o.skin ?? "#F6C9A0";
  const style = o.hairStyle ?? "short";
  const shoe = o.boots ?? INK;
  const bootTop = o.boots
    ? `<rect x="-36" y="-44" width="30" height="38" rx="8" fill="${o.boots}"/><rect x="6" y="-44" width="30" height="38" rx="8" fill="${o.boots}"/>`
    : "";
  const arms = o.cheer
    ? `<path d="M-34 -140 L -74 -196 M34 -140 L 74 -196" stroke="${shirt}" stroke-width="20" fill="none"/><circle cx="-76" cy="-200" r="12" fill="${skin}"/><circle cx="76" cy="-200" r="12" fill="${skin}"/>`
    : `<path d="M-36 -138 L -58 -86 M36 -138 L 58 -86" stroke="${shirt}" stroke-width="20" fill="none"/><circle cx="-60" cy="-80" r="12" fill="${skin}"/><circle cx="60" cy="-80" r="12" fill="${skin}"/>`;
  const backHair =
    style === "long"
      ? `<path d="M-48 -210 q -14 60 -4 96 h 104 q 10 -36 -4 -96 Z" fill="${hair}"/>`
      : style === "pigtails"
        ? `<circle cx="-56" cy="-196" r="18" fill="${hair}"/><circle cx="56" cy="-196" r="18" fill="${hair}"/>`
        : style === "bun"
          ? `<circle cx="0" cy="-262" r="20" fill="${hair}"/>`
          : "";
  const frontHair = `<path d="M-46 -214 q 4 -46 46 -46 q 42 0 46 46 q -30 -24 -92 0 Z" fill="${hair}"/>`;
  const glasses = o.glasses
    ? `<g stroke="${INK}" stroke-width="3" fill="none"><circle cx="-16" cy="-206" r="11"/><circle cx="16" cy="-206" r="11"/><line x1="-5" y1="-206" x2="5" y2="-206"/></g>`
    : "";
  return g(
    x,
    y,
    s,
    `<rect x="-30" y="-78" width="24" height="72" rx="8" fill="${pants}"/><rect x="6" y="-78" width="24" height="72" rx="8" fill="${pants}"/>` +
      bootTop +
      `<ellipse cx="-22" cy="-4" rx="22" ry="10" fill="${shoe}"/><ellipse cx="22" cy="-4" rx="22" ry="10" fill="${shoe}"/>` +
      arms +
      `<rect x="-40" y="-160" width="80" height="92" rx="22" fill="${shirt}"/>` +
      backHair +
      `<circle cx="0" cy="-206" r="46" fill="${skin}"/>` +
      frontHair +
      cheeks(28, -190) +
      g(0, -206, 1, face(o.mood ?? "smile", 16, 0)) +
      glasses,
  );
}

// --- Objects ---------------------------------------------------------------------------------------------

export function boots(x: number, y: number, s = 1, color = "#FFD23F"): string {
  const one = (dx: number) =>
    `<path d="M${dx - 18} -80 h 36 v 56 h 26 q 16 0 16 14 v 10 h -78 Z" fill="${color}"/><rect x="${dx - 18}" y="-80" width="36" height="12" rx="4" fill="#F2B705"/><ellipse cx="${dx - 4}" cy="-50" rx="5" ry="12" fill="#FFFFFF" opacity="0.5"/>`;
  return g(x, y, s, one(-44) + one(36));
}

export function door(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<rect x="-70" y="-260" width="140" height="260" rx="8" fill="#B07F52"/><rect x="-54" y="-244" width="108" height="100" rx="6" fill="#C8956A"/><rect x="-54" y="-128" width="108" height="112" rx="6" fill="#C8956A"/><circle cx="44" cy="-130" r="8" fill="#FFD45E"/>`,
  );
}

export function windowFrame(x: number, y: number, w: number, h: number, inner: string): string {
  const id = `clip${gradientCounter++}`;
  return (
    `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/></clipPath></defs>` +
    `<g clip-path="url(#${id})">${inner}</g>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="none" stroke="#B07F52" stroke-width="14"/>` +
    `<line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}" stroke="#B07F52" stroke-width="8"/>` +
    `<line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="#B07F52" stroke-width="8"/>`
  );
}

export function bed(x: number, y: number, s = 1, blanket = "#C59CF0"): string {
  return g(
    x,
    y,
    s,
    `<rect x="-220" y="-150" width="30" height="150" rx="10" fill="#9B6B43"/><rect x="190" y="-100" width="30" height="100" rx="10" fill="#9B6B43"/><rect x="-200" y="-70" width="400" height="50" rx="10" fill="#FFF7E8"/>` +
      `<ellipse cx="-140" cy="-84" rx="50" ry="22" fill="#FFFFFF"/>` +
      `<path d="M-90 -70 Q -40 -170 60 -150 Q 150 -140 196 -70 V -22 H -90 Z" fill="${blanket}"/><g fill="#FFFFFF" opacity="0.5"><circle cx="-10" cy="-100" r="8"/><circle cx="70" cy="-110" r="8"/><circle cx="130" cy="-70" r="8"/><circle cx="30" cy="-60" r="8"/></g>`,
  );
}

export function lightning(x: number, y: number, s = 1): string {
  return g(x, y, s, `<path d="M0 0 l -40 90 h 34 l -24 80 l 78 -110 h -38 l 30 -60 Z" fill="#FFE066"/>`);
}

export function paperMap(x: number, y: number, s = 1, rotate = 0): string {
  return g(
    x,
    y,
    s,
    `<g transform="rotate(${rotate})"><rect x="-120" y="-80" width="240" height="160" rx="6" fill="#F7E7C4" stroke="#D2B98A" stroke-width="4"/>` +
      `<line x1="-40" y1="-80" x2="-40" y2="80" stroke="#E4D0A4" stroke-width="3"/><line x1="40" y1="-80" x2="40" y2="80" stroke="#E4D0A4" stroke-width="3"/>` +
      `<path d="M-96 44 q 40 -60 70 -20 t 60 -30 t 50 20" stroke="#8A6748" stroke-width="5" stroke-dasharray="4 12" fill="none"/>` +
      `<circle cx="-92" cy="42" r="10" fill="#4FAE6A"/><rect x="-22" y="6" width="16" height="16" fill="#8EC9F0"/>` +
      `<path d="M72 -4 l 24 24 M96 -4 l -24 24" stroke="#D9480F" stroke-width="7"/></g>`,
  );
}

export function drawer(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<rect x="-170" y="-200" width="340" height="200" rx="10" fill="#B07F52"/><rect x="-150" y="-184" width="300" height="70" rx="8" fill="#C8956A"/><circle cx="0" cy="-150" r="10" fill="#FFD45E"/>` +
      `<path d="M-170 -100 h 340 l 30 60 h -400 Z" fill="#9B6B43"/><rect x="-200" y="-40" width="400" height="50" rx="8" fill="#C8956A"/><circle cx="0" cy="-14" r="10" fill="#FFD45E"/>` +
      `<g><circle cx="-110" cy="-70" r="12" fill="#E0554A"/><circle cx="-76" cy="-62" r="10" fill="#5AA9E6"/><rect x="60" y="-84" width="60" height="34" rx="4" fill="#FFF7E8"/><path d="M-20 -66 h 40 M 20 -66 l 0 12" stroke="#8C7F6C" stroke-width="6"/><circle cx="-26" cy="-66" r="9" fill="none" stroke="#8C7F6C" stroke-width="6"/></g>`,
  );
}

export function tinBox(x: number, y: number, s = 1, open = false): string {
  const lid = open
    ? `<path d="M-70 -60 l 20 -70 h 140 l -20 70 Z" fill="#7FB7A6" stroke="#5E9686" stroke-width="4"/>`
    : `<rect x="-74" y="-72" width="148" height="20" rx="6" fill="#7FB7A6" stroke="#5E9686" stroke-width="4"/>`;
  const content = open
    ? `<g><circle cx="-40" cy="-58" r="10" fill="#E0554A"/><circle cx="-16" cy="-62" r="10" fill="#5AA9E6"/><circle cx="8" cy="-58" r="10" fill="#FFD45E"/><path d="M30 -56 q 20 -50 40 -60 q -6 34 -30 62 Z" fill="#5AA9E6"/></g>`
    : "";
  return g(
    x,
    y,
    s,
    `${lid}${content}<rect x="-70" y="-56" width="140" height="56" rx="6" fill="#8FC9B8" stroke="#5E9686" stroke-width="4"/><rect x="-30" y="-40" width="60" height="24" rx="4" fill="#F7E7C4"/>`,
  );
}

export function note(x: number, y: number, s = 1): string {
  return g(
    x,
    y,
    s,
    `<rect x="-90" y="-70" width="180" height="140" rx="6" fill="#FFF7E8" stroke="#D2B98A" stroke-width="4" transform="rotate(-4)"/><g stroke="#8A6748" stroke-width="5" transform="rotate(-4)"><line x1="-64" y1="-36" x2="64" y2="-36"/><line x1="-64" y1="-8" x2="64" y2="-8"/><line x1="-64" y1="20" x2="30" y2="20"/><line x1="10" y1="48" x2="64" y2="48"/></g>`,
  );
}

export function sunbeam(x1: number, x2: number, tx: number, ty: number): string {
  return `<path d="M${x1} 0 L ${x2} 0 L ${tx + 50} ${ty} L ${tx - 50} ${ty} Z" fill="#FFE066" opacity="0.4"/>`;
}

export function robot(x: number, y: number, s = 1, mood: "on" | "think" | "laugh" | "sad" = "on"): string {
  const eye = mood === "laugh"
    ? `<path d="M-34 -236 q 12 -14 24 0 M10 -236 q 12 -14 24 0" stroke="#2F6B4F" stroke-width="6" fill="none"/>`
    : `<circle cx="-22" cy="-238" r="13" fill="#B8F5C8"/><circle cx="22" cy="-238" r="13" fill="#B8F5C8"/><circle cx="${mood === "think" ? -18 : -22}" cy="${mood === "sad" ? -234 : -238}" r="5" fill="#2F6B4F"/><circle cx="${mood === "think" ? 26 : 22}" cy="${mood === "sad" ? -234 : -238}" r="5" fill="#2F6B4F"/>`;
  const mouth = mood === "laugh"
    ? `<path d="M-24 -212 q 24 26 48 0 Z" fill="#2F6B4F"/>`
    : mood === "sad"
      ? `<path d="M-18 -204 q 18 -10 36 0" stroke="#2F6B4F" stroke-width="5" fill="none"/>`
      : `<rect x="-20" y="-214" width="40" height="8" rx="4" fill="#2F6B4F"/>`;
  const shake = mood === "laugh"
    ? `<g stroke="#D2AE7C" stroke-width="5" fill="none"><path d="M-96 -250 q -12 10 0 22"/><path d="M96 -250 q 12 10 0 22"/><path d="M-86 -120 q -12 10 0 22"/><path d="M86 -120 q 12 10 0 22"/></g>`
    : "";
  return g(
    x,
    y,
    s,
    `<rect x="-44" y="-50" width="34" height="50" rx="6" fill="#C9A26B"/><rect x="10" y="-50" width="34" height="50" rx="6" fill="#C9A26B"/>` +
      `<rect x="-64" y="-170" width="128" height="124" rx="10" fill="#D9B27C"/><rect x="-44" y="-150" width="88" height="50" rx="6" fill="#F2DDB8"/>` +
      `<circle cx="-22" cy="-126" r="9" fill="#58C27D"/><circle cx="4" cy="-126" r="9" fill="#E0554A"/><rect x="20" y="-134" width="18" height="16" rx="3" fill="#5AA9E6"/>` +
      `<g fill="#B9BEC7" stroke="#8C929C" stroke-width="3"><circle cx="-80" cy="-140" r="16"/><circle cx="80" cy="-140" r="16"/></g>` +
      `<path d="M-80 -124 v 50 M80 -124 v 50" stroke="#C9A26B" stroke-width="16"/>` +
      `<path d="M0 -170 q -10 -4 0 -8 q 10 -4 0 -8 q -10 -4 0 -8" stroke="#8C929C" stroke-width="5" fill="none"/>` +
      `<rect x="-58" y="-270" width="116" height="80" rx="10" fill="#E3C08D"/>` +
      eye + mouth + shake +
      `<line x1="0" y1="-270" x2="0" y2="-296" stroke="#8C929C" stroke-width="5"/><circle cx="0" cy="-302" r="8" fill="#E0554A"/>`,
  );
}

export function rug(x: number, y: number, w: number, color = "#E58F7B"): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${w / 2}" ry="${w / 9}" fill="${color}"/><ellipse cx="${x}" cy="${y}" rx="${w / 2 - 24}" ry="${w / 9 - 10}" fill="none" stroke="#FFF0D6" stroke-width="6" stroke-dasharray="14 12"/>`;
}

export function speech(x: number, y: number, text: string, w = 200): string {
  return (
    `<rect x="${x - w / 2}" y="${y - 34}" width="${w}" height="64" rx="28" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M${x - 10} ${y + 29} l 0 22 l 26 -22 Z" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/><rect x="${x - 14}" y="${y + 20}" width="34" height="9" fill="#FFFFFF"/>` +
    `<text x="${x}" y="${y + 10}" text-anchor="middle" direction="rtl" font-family="Rubik, 'Segoe UI', 'Arial Hebrew', Arial, Tahoma, sans-serif" font-weight="700" font-size="30" fill="${INK}">${escapeXml(text)}</text>`
  );
}

export function sock(x: number, y: number, s = 1): string {
  return g(x, y, s, `<path d="M-10 -40 h 24 v 34 q 0 14 -16 14 h -24 q -10 -18 16 -22 Z" fill="#E0554A"/><rect x="-10" y="-40" width="24" height="10" fill="#FFFFFF"/>`);
}

export function notebook(x: number, y: number, s = 1): string {
  return g(x, y, s, `<rect x="-34" y="-46" width="68" height="92" rx="6" fill="#FFF7E8" stroke="#8C929C" stroke-width="4"/><g stroke="#8C929C" stroke-width="4"><line x1="-20" y1="-22" x2="20" y2="-22"/><line x1="-20" y1="-2" x2="20" y2="-2"/><line x1="-20" y1="18" x2="6" y2="18"/></g>`);
}

// --- Covers ------------------------------------------------------------------------------------------------

export const COVER_W = 600;
export const COVER_H = 800;

function wrapTitle(title: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of title.split(/\s+/)) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines;
}

/** Cover: an illustration area (600x560) above a title band. */
export function cover(title: string, art: string, band: string, textColor = "#FFFFFF"): string {
  const lines = wrapTitle(title, 16);
  const size = lines.length > 2 ? 46 : 54;
  const start = 560 + (240 - lines.length * (size + 10)) / 2 + size - 6;
  const text = lines
    .map(
      (line, i) =>
        `<text x="300" y="${start + i * (size + 10)}" text-anchor="middle" direction="rtl" font-family="Rubik, 'Segoe UI', 'Arial Hebrew', Arial, Tahoma, sans-serif" font-weight="800" font-size="${size}" fill="${textColor}">${escapeXml(line)}</text>`,
    )
    .join("");
  return scene(
    `${art}<rect x="0" y="560" width="600" height="240" fill="${band}"/><path d="M0 560 q 75 -26 150 0 t 150 0 t 150 0 t 150 0 V 580 H 0 Z" fill="${band}"/>${text}`,
    `כריכת הספר ${title}`,
    COVER_W,
    COVER_H,
  );
}
