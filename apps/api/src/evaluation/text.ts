/** Small text helpers for fuzzy, explainable matching of names and keywords. */

/** "ParkingSpot" / "parking_spot" / "Parking spots" -> ["parking", "spot"] */
export function tokens(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular);
}

/** "Parking Spots" -> "parkingspot" */
export function compact(text: string): string {
  return tokens(text).join('');
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

/**
 * Does a class name denote a concept? Exact match, or the concept appears as
 * a suffix/prefix ("CompactSpot" is a Spot, "SpotAllocator" relates to spots).
 */
export function nameMatches(entityName: string, candidates: string[]): boolean {
  const name = compact(entityName);
  if (!name) return false;
  return candidates.some((candidate) => {
    const c = compact(candidate);
    if (!c) return false;
    if (name === c) return true;
    if (c.length >= 3 && name.endsWith(c)) return true;
    if (c.length >= 4 && name.startsWith(c)) return true;
    return false;
  });
}

/** Whether any keyword appears as a token (or token prefix) in the text. */
export function mentionsAny(text: string, keywords: string[]): string[] {
  const words = tokens(text);
  const joined = words.join('');
  const hits = new Set<string>();
  for (const keyword of keywords) {
    const k = compact(keyword);
    if (!k) continue;
    if (words.some((w) => w === k || (k.length >= 4 && w.startsWith(k))) || (k.length >= 6 && joined.includes(k))) {
      hits.add(keyword);
    }
  }
  return [...hits];
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function listToSentence(items: string[], max = 4): string {
  const quoted = items.map((i) => `"${i}"`);
  if (quoted.length <= 1) return quoted.join('');
  const shown = quoted.slice(0, max);
  const rest = quoted.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  return `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}
