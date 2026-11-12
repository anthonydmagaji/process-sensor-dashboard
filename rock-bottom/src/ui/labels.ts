import type { RoundKind, RoundState } from '../game/types';

export const GAME_NAME = 'Rock Bottom';
export const ZERO_LABEL = 'Rock bottom!';

export function roundTitle(round: Pick<RoundState, 'kind' | 'number'>): string {
  if (round.kind === 'tiebreak') return 'Tiebreak';
  if (round.kind === 'h2h') return 'Head to head';
  return `Round ${round.number}`;
}

export function roundKicker(kind: RoundKind, questionNumber: number): string {
  if (kind === 'tiebreak') return 'Sudden death';
  if (kind === 'h2h') return `Round 3 · Question ${questionNumber}`;
  return 'Elimination round';
}

export function roundRules(kind: RoundKind): string {
  switch (kind) {
    case 'elim1':
    case 'elim2':
      return 'Each player gives one answer. Low scores are good, a wrong answer costs 100, and the team with the highest total goes home.';
    case 'tiebreak':
      return 'The tied teams give one answer each on a new question. The highest score is out.';
    case 'h2h':
      return 'One answer each. The lower score takes the question, and the first team to win two questions plays for the jackpot.';
  }
}

export function formatLabel(format: string): string {
  switch (format) {
    case 'open':
      return 'Open list';
    case 'blank':
      return 'Fill the blank';
    case 'clues':
      return 'Clue list';
    default:
      return 'Clue board';
  }
}

export function playerLabel(player: 0 | 1): string {
  return player === 0 ? 'Player 1' : 'Player 2';
}
