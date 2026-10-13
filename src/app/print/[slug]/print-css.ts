/**
 * Styles of the print view, scoped under `.print-root`. They live here (and
 * not in globals.css) because they belong to this route only.
 *
 * On screen every sheet is a preview card with the proportions of an A4
 * landscape page. Sizes inside a sheet use container units (cqw), so the
 * preview and the printed sheet have the same layout at any width.
 *
 * Paper is always white with dark ink, also in the bedtime theme.
 */
export const PRINT_CSS = `
@page {
  size: A4 landscape;
  margin: 12mm;
}

.print-root {
  --ink: #3b2f2a;
  --ink-muted: #6f6055;
  --rule: #c9b193;
}

.print-sheets {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.print-sheet {
  container-type: inline-size;
  position: relative;
  width: 100%;
  aspect-ratio: 273 / 186;
  background: #ffffff;
  color: var(--ink);
  border: 1px solid var(--rule);
  border-radius: 0.75rem;
  box-shadow: var(--elev-card);
  overflow: hidden;
}

.print-sheet-inner {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 56fr 44fr;
  /* A definite row height, so a tall cover is scaled down instead of overflowing. */
  grid-template-rows: minmax(0, 1fr);
  align-items: center;
  gap: 4cqw;
  padding: 3cqw 3cqw 5cqw;
}

.print-sheet-inner.is-single {
  grid-template-columns: 1fr;
  padding-inline: 14cqw;
}

.print-art {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.print-art img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 1cqw;
}

.print-copy {
  min-width: 0;
  max-height: 100%;
  overflow: hidden;
}

.print-story {
  font-family: var(--font-story-face), "Frank Ruhl Libre", "Times New Roman", serif;
  line-height: 1.75;
  margin: 0;
  white-space: pre-line;
  overflow-wrap: break-word;
}
.print-story.is-xl { font-size: 4.4cqw; text-align: center; }
.print-story.is-lg { font-size: 3.3cqw; text-align: center; }
.print-story.is-md { font-size: 2.5cqw; }
.print-story.is-sm { font-size: 2cqw; }
.print-story.is-xs { font-size: 1.6cqw; line-height: 1.6; }

.print-title {
  font-family: var(--font-story-face), "Frank Ruhl Libre", "Times New Roman", serif;
  font-size: 5cqw;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
  margin: 0 0 2cqw;
  text-wrap: balance;
}

.print-meta {
  font-size: 1.9cqw;
  text-align: center;
  margin: 0;
}

.print-muted {
  color: var(--ink-muted);
  font-size: 1.6cqw;
}

.print-summary {
  font-family: var(--font-story-face), "Frank Ruhl Libre", "Times New Roman", serif;
  font-size: 1.8cqw;
  line-height: 1.6;
  margin: 2.5cqw 0 0;
}

.print-heading {
  font-family: var(--font-story-face), "Frank Ruhl Libre", "Times New Roman", serif;
  font-size: 2.8cqw;
  font-weight: 700;
  text-align: center;
  margin: 2cqw 0 1cqw;
}

.print-questions {
  font-family: var(--font-story-face), "Frank Ruhl Libre", "Times New Roman", serif;
  font-size: 2cqw;
  line-height: 1.6;
  margin: 0;
  padding-inline-start: 3cqw;
  list-style: decimal;
}

.print-credits {
  border-top: 1px solid var(--rule);
  margin: 2.5cqw 0 0;
  padding-top: 1.2cqw;
  font-size: 1.35cqw;
  line-height: 1.5;
  color: var(--ink-muted);
}
.print-credits div { display: flex; gap: 0.6cqw; }
.print-credits dt { font-weight: 600; }
.print-credits dt::after { content: ":"; }
.print-credits dd { margin: 0; overflow-wrap: anywhere; }
.print-credit-logo {
  display: block;
  height: 5cqw;
  width: auto;
  margin: 1cqw auto 0;
}

.print-folio {
  position: absolute;
  inset-inline: 0;
  bottom: 1.6cqw;
  text-align: center;
  font-size: 1.3cqw;
  color: var(--ink-muted);
}

@media print {
  html,
  body {
    height: auto !important;
    min-height: 0 !important;
    display: block !important;
    background: #ffffff !important;
    color: #3b2f2a !important;
  }

  #main {
    display: block !important;
  }

  .site-chrome,
  .print-toolbar {
    display: none !important;
  }

  .print-root {
    display: block !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .print-sheets {
    display: block;
  }

  /* One spread per sheet of paper. */
  .print-sheet {
    width: 273mm;
    height: 185mm;
    aspect-ratio: auto;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    break-after: page;
    page-break-after: always;
    break-inside: avoid;
    page-break-inside: avoid;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .print-sheet:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}
`;
