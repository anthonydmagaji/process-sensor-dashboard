import type { Candidate } from '../matcher';
import { sameAnswer } from '../matcher';
import { weightedIndex } from './random';
import type { Difficulty, Rng } from './types';

interface Profile {
  /** Chance of blurting out a wrong answer. */
  wrongChance: number;
  /**
   * Preference for an answer given its position among the remaining answers,
   * from 0 (the most obscure) to 1 (the most obvious).
   */
  weight: (position: number) => number;
}

export const AI_PROFILES: Record<Difficulty, Profile> = {
  // Reaches for the answers everyone knows, and slips up fairly often.
  easy: { wrongChance: 0.2, weight: (position) => 0.04 + position ** 2.4 },
  // Solid but unspectacular: mostly middling answers.
  medium: { wrongChance: 0.1, weight: (position) => 0.12 + Math.max(0, 1 - Math.abs(position - 0.42) / 0.45) },
  // Digs out the obscure answers and rarely gets one wrong.
  hard: { wrongChance: 0.04, weight: (position) => 0.02 + (1 - position) ** 3.2 },
};

export interface AiChoice {
  text: string;
  /** Whether the computer meant to give a wrong answer. */
  intendedWrong: boolean;
}

/**
 * Chooses a computer team's answer.
 *
 * @param available  valid answers that have not been given yet
 * @param decoys     plausible wrong answers for this question
 * @param usedWrong  wrong answers already given this round
 */
export function chooseAiAnswer(
  available: readonly Candidate[],
  decoys: readonly string[],
  usedWrong: readonly string[],
  difficulty: Difficulty,
  rng: Rng,
): AiChoice {
  const profile = AI_PROFILES[difficulty];
  const freshDecoys = decoys.filter((decoy) => !usedWrong.some((wrong) => sameAnswer(decoy, wrong)));

  const slip = rng() < profile.wrongChance;
  if ((slip || available.length === 0) && freshDecoys.length > 0) {
    return { text: freshDecoys[Math.min(freshDecoys.length - 1, Math.floor(rng() * freshDecoys.length))], intendedWrong: true };
  }
  if (available.length === 0) return { text: 'Pass', intendedWrong: true };

  const ranked = available.slice().sort((a, b) => a.score - b.score);
  const last = Math.max(1, ranked.length - 1);
  const weights = ranked.map((_, index) => profile.weight(index / last));
  return { text: ranked[weightedIndex(rng, weights)].display, intendedWrong: false };
}

/** How long a computer team "thinks" before answering, in milliseconds. */
export function aiThinkingTime(difficulty: Difficulty, rng: Rng): number {
  const base = difficulty === 'hard' ? 1500 : difficulty === 'medium' ? 1300 : 1100;
  return Math.round(base + rng() * 1500);
}

const AI_TEAM_NAMES = [
  'The Outliers',
  'Quiz Pro Quo',
  'Low Rollers',
  'The Long Shots',
  'Deep Cuts',
  'Trivial Pursuers',
  'The Footnotes',
  'Les Quizerables',
  'Obscure Reference',
  'The Small Print',
  'Margin of Error',
  'Second Guessers',
];

/** Names for the computer teams, avoiding any name a human team has taken. */
export function aiTeamNames(count: number, taken: readonly string[], rng: Rng): string[] {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  const pool = AI_TEAM_NAMES.filter((name) => !used.has(name.toLowerCase()));
  const names: string[] = [];
  while (names.length < count && pool.length > 0) {
    names.push(pool.splice(Math.min(pool.length - 1, Math.floor(rng() * pool.length)), 1)[0]);
  }
  return names;
}
