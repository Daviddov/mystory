/**
 * A small subset of the Unicode Bidirectional Algorithm, enough for stories
 * for children: Hebrew sentences with digits, punctuation and the occasional
 * Latin word. Explicit embedding and override characters are not supported.
 *
 * Text goes in in logical (typing) order. The result is a list of runs in
 * VISUAL order, left to right. Each run keeps its characters in logical order
 * and carries its direction, because the shaper needs logical order to place
 * vowel points (nikud) on their base letters.
 */

export type Direction = "rtl" | "ltr";

export interface BidiRun {
  /** Characters in logical order. Brackets in an rtl run are already mirrored. */
  text: string;
  direction: Direction;
}

type CharClass = "R" | "L" | "EN" | "N";

const MIRROR: Record<string, string> = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
  "«": "»",
  "»": "«",
};

const NUMBER_SEPARATORS = new Set([".", ",", ":", "/", "-"]);

function isHebrewStrong(cp: number): boolean {
  // Maqaf, paseq, sof pasuq, letters, geresh and gershayim, and the presentation forms.
  return (
    cp === 0x05be ||
    cp === 0x05c0 ||
    cp === 0x05c3 ||
    cp === 0x05c6 ||
    (cp >= 0x05d0 && cp <= 0x05f4) ||
    (cp >= 0xfb1d && cp <= 0xfb4f && cp !== 0xfb1e)
  );
}

/** Combining marks: Hebrew points and cantillation, and the generic combining block. */
export function isCombiningMark(cp: number): boolean {
  return (
    (cp >= 0x0591 && cp <= 0x05bd) ||
    cp === 0x05bf ||
    cp === 0x05c1 ||
    cp === 0x05c2 ||
    cp === 0x05c4 ||
    cp === 0x05c5 ||
    cp === 0x05c7 ||
    cp === 0xfb1e ||
    (cp >= 0x0300 && cp <= 0x036f)
  );
}

function isLatinLetter(cp: number): boolean {
  return (
    (cp >= 0x41 && cp <= 0x5a) ||
    (cp >= 0x61 && cp <= 0x7a) ||
    (cp >= 0xc0 && cp <= 0x24f && cp !== 0xd7 && cp !== 0xf7)
  );
}

function classify(cp: number): CharClass | "NSM" {
  if (isCombiningMark(cp)) return "NSM";
  if (isHebrewStrong(cp)) return "R";
  if (cp >= 0x30 && cp <= 0x39) return "EN";
  if (isLatinLetter(cp)) return "L";
  return "N";
}

/** Direction of the first strong character; rtl when there is none (this is a Hebrew site). */
export function baseDirection(text: string): Direction {
  for (const ch of text) {
    const cls = classify(ch.codePointAt(0) as number);
    if (cls === "R") return "rtl";
    if (cls === "L") return "ltr";
  }
  return "rtl";
}

/**
 * Split one line (no line breaks) into visual runs, ordered left to right.
 * `base` defaults to the direction of the first strong character.
 */
export function bidiRuns(line: string, base: Direction = baseDirection(line)): BidiRun[] {
  const chars = Array.from(line);
  if (chars.length === 0) return [];
  const baseClass: CharClass = base === "rtl" ? "R" : "L";

  // 1. Classify. A combining mark takes the class of the character it sits on.
  const classes: CharClass[] = [];
  for (let i = 0; i < chars.length; i++) {
    const cls = classify(chars[i].codePointAt(0) as number);
    classes.push(cls === "NSM" ? (i > 0 ? classes[i - 1] : baseClass) : cls);
  }

  // 2. A single separator between two digits belongs to the number (3.5, 10:30).
  for (let i = 1; i < chars.length - 1; i++) {
    if (classes[i] === "N" && NUMBER_SEPARATORS.has(chars[i]) && classes[i - 1] === "EN" && classes[i + 1] === "EN") {
      classes[i] = "EN";
    }
  }

  // 3. Digits that follow a Latin letter are part of the Latin text.
  let lastStrong: CharClass = baseClass;
  for (let i = 0; i < chars.length; i++) {
    if (classes[i] === "R" || classes[i] === "L") lastStrong = classes[i];
    else if (classes[i] === "EN" && lastStrong === "L") classes[i] = "L";
  }

  // 4. Neutrals between two runs of the same direction join them; otherwise
  //    they follow the base direction. Numbers count as rtl for this rule.
  const strongSide = (cls: CharClass): CharClass => (cls === "EN" ? "R" : cls);
  for (let i = 0; i < chars.length; ) {
    if (classes[i] !== "N") {
      i++;
      continue;
    }
    let end = i;
    while (end < chars.length && classes[end] === "N") end++;
    const before = i > 0 ? strongSide(classes[i - 1]) : baseClass;
    const after = end < chars.length ? strongSide(classes[end]) : baseClass;
    const resolved = before === after ? before : baseClass;
    for (let k = i; k < end; k++) classes[k] = resolved;
    i = end;
  }

  // 5. Embedding levels.
  const levelOf = (cls: CharClass): number => {
    if (base === "rtl") return cls === "R" ? 1 : 2;
    return cls === "L" ? 0 : cls === "R" ? 1 : 2;
  };

  // 6. Level runs in logical order.
  const runs: { text: string; level: number }[] = [];
  for (let i = 0; i < chars.length; i++) {
    const level = levelOf(classes[i]);
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.text += chars[i];
    else runs.push({ text: chars[i], level });
  }

  // 7. Reorder: from the highest level down to 1, reverse every sequence of
  //    runs at that level or higher.
  const maxLevel = Math.max(...runs.map((r) => r.level));
  for (let level = maxLevel; level >= 1; level--) {
    for (let i = 0; i < runs.length; ) {
      if (runs[i].level < level) {
        i++;
        continue;
      }
      let end = i;
      while (end < runs.length && runs[end].level >= level) end++;
      const reversed = runs.slice(i, end).reverse();
      runs.splice(i, end - i, ...reversed);
      i = end;
    }
  }

  return runs.map((run) => {
    const direction: Direction = run.level % 2 === 1 ? "rtl" : "ltr";
    const text =
      direction === "rtl"
        ? Array.from(run.text)
            .map((ch) => MIRROR[ch] ?? ch)
            .join("")
        : run.text;
    return { text, direction };
  });
}
