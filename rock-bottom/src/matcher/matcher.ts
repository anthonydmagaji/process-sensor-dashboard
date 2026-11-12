import { allowedDistance, editDistance } from './distance';
import { compact, normalize, numberTokens } from './normalize';

/** One thing a typed answer can match: an answer and every accepted way of writing it. */
export interface Candidate {
  /** Stable identifier within the question. */
  key: string;
  /** The answer as it should be shown on screen. */
  display: string;
  /** Every accepted spelling: the answer itself followed by its aliases. */
  forms: string[];
  score: number;
}

export interface MatchOptions {
  /** Spelling questions: typos are not forgiven. */
  exact?: boolean;
  /**
   * Known wrong answers. Typing one of these is never forgiven as a typo of a
   * right answer, which keeps apart real near-twins such as Iceland / Ireland.
   */
  blocked?: readonly string[];
}

export interface Match {
  candidate: Candidate;
  /** Number of typos forgiven; 0 for an exact match. */
  distance: number;
}

export type Judgement =
  | { kind: 'empty' }
  | { kind: 'duplicate'; display: string }
  | { kind: 'correct'; key: string; display: string; score: number; distance: number }
  | { kind: 'wrong'; display: string };

function sameNumbers(a: string, b: string): boolean {
  const left = numberTokens(a);
  const right = numberTokens(b);
  return left.length === right.length && left.every((token, i) => token === right[i]);
}

/**
 * Compares a normalised input with a normalised target.
 * Returns the number of typos forgiven, or null when they do not match.
 */
export function matchDistance(input: string, target: string, options: MatchOptions = {}): number | null {
  if (!input || !target) return null;
  if (input === target) return 0;

  const a = compact(input);
  const b = compact(target);
  if (a === b) return 0;
  if (options.exact) return null;

  // Numbers carry meaning (Henry VII / Henry VIII, Toy Story 2 / 3):
  // they must agree exactly before any typo is forgiven.
  if (!sameNumbers(input, target)) return null;
  // Typos rarely hit the first letter, and requiring it to match rules out
  // different real answers such as Niger / Tiger or Gambia / Zambia.
  if (a[0] !== b[0]) return null;

  const limit = allowedDistance(b.length);
  if (limit === 0 || Math.abs(a.length - b.length) > limit) return null;
  const distance = editDistance(a, b);
  return distance <= limit ? distance : null;
}

/** True when two typed answers are the same answer, allowing for typos. */
export function sameAnswer(a: string, b: string, options: MatchOptions = {}): boolean {
  return matchDistance(normalize(a), normalize(b), options) !== null;
}

/**
 * Finds the candidate a typed answer refers to. An exact match always beats a
 * fuzzy one; between equally close fuzzy matches the higher-scoring answer
 * wins, so a doubtful typo can never earn the better score.
 */
export function findMatch(input: string, candidates: Candidate[], options: MatchOptions = {}): Match | null {
  const typed = normalize(input);
  if (!typed) return null;

  const blocked = options.blocked?.some((wrong) => normalize(wrong) === typed) ?? false;
  const strictness: MatchOptions = blocked ? { exact: true } : options;

  let best: Match | null = null;
  for (const candidate of candidates) {
    for (const form of candidate.forms) {
      const distance = matchDistance(typed, normalize(form), strictness);
      if (distance === null) continue;
      if (distance === 0) return { candidate, distance };
      if (
        !best ||
        distance < best.distance ||
        (distance === best.distance && candidate.score > best.candidate.score)
      ) {
        best = { candidate, distance };
      }
    }
  }
  return best;
}

/**
 * Judges a typed answer.
 *
 * @param candidates   every answer that is valid right now
 * @param givenKeys    keys of valid answers already given this round
 * @param givenWrong   wrong answers already given this round, as typed
 */
export function judgeAnswer(
  input: string,
  candidates: Candidate[],
  givenKeys: ReadonlySet<string>,
  givenWrong: readonly string[],
  options: MatchOptions = {},
): Judgement {
  const cleaned = input.replace(/\s+/g, ' ').trim();
  if (!normalize(cleaned)) return { kind: 'empty' };

  const match = findMatch(cleaned, candidates, options);
  if (match) {
    const { candidate, distance } = match;
    if (givenKeys.has(candidate.key)) return { kind: 'duplicate', display: candidate.display };
    return {
      kind: 'correct',
      key: candidate.key,
      display: candidate.display,
      score: candidate.score,
      distance,
    };
  }

  // A repeated wrong answer must be the same text; a merely similar one is a
  // different guess and is judged on its own.
  const previous = givenWrong.find((wrong) => sameAnswer(cleaned, wrong, { exact: true }));
  if (previous) return { kind: 'duplicate', display: previous };
  return { kind: 'wrong', display: cleaned };
}
