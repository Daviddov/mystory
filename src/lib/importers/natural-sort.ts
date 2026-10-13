/** Natural filename ordering: "page2" before "page10". Client-safe. */

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Sorts by path, folder by folder, so "ch1/10.png" comes before "ch2/1.png"
 * and "2.png" before "10.png". Returns a new array.
 */
export function sortByNaturalPath<T>(items: readonly T[], pathOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, parts: pathOf(item).split(/[\\/]+/).filter(Boolean) }))
    .sort((a, b) => {
      const shared = Math.min(a.parts.length, b.parts.length);
      for (let i = 0; i < shared; i += 1) {
        const aIsFile = i === a.parts.length - 1;
        const bIsFile = i === b.parts.length - 1;
        // Files of a folder come before its sub-folders.
        if (aIsFile !== bIsFile) return aIsFile ? -1 : 1;
        const order = naturalCompare(a.parts[i], b.parts[i]);
        if (order !== 0) return order;
      }
      return a.parts.length - b.parts.length;
    })
    .map((entry) => entry.item);
}
