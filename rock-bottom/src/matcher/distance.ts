/**
 * Damerau-Levenshtein distance (optimal string alignment): the number of
 * single-character insertions, deletions, substitutions and adjacent swaps
 * needed to turn one string into the other.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let twoBack: number[] = [];
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoBack[j - 2] + 1);
      }
      current.push(value);
    }
    twoBack = previous;
    previous = current;
  }
  return previous[b.length];
}

/**
 * How many typos an answer of the given length may contain and still count.
 * Short answers must be exact because one changed letter usually makes a
 * different real answer (Iran / Iraq, Mali / Male).
 */
export function allowedDistance(length: number): number {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  if (length <= 14) return 2;
  return 3;
}
