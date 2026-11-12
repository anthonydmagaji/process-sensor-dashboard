/** Shape of data/questions.json and of the running game. */

export type QuestionFormat = 'open' | 'blank' | 'clues' | 'board';

export interface AnswerEntry {
  text: string;
  /** How many of 100 people surveyed gave this answer. */
  score: number;
  aliases?: string[];
}

export interface ClueEntry {
  /** A single clue (formats "blank" and "clues"). */
  clue?: string;
  /** Several hints pointing at one answer (format "board"). */
  hints?: string[];
  answer: string;
  /** How many of 100 people surveyed got this one right. */
  score: number;
  aliases?: string[];
}

export interface Question {
  id: string;
  category: string;
  format: QuestionFormat;
  prompt: string;
  detail?: string;
  /** People questions: the surname alone is accepted when it is unambiguous. */
  acceptSurname?: boolean;
  /** Spelling questions: no typos are forgiven. */
  exactSpelling?: boolean;
  /** Plausible wrong answers, used by the computer teams when they slip up. */
  decoys: string[];
  /** Format "open": every valid answer. */
  answers?: AnswerEntry[];
  /** Formats "blank", "clues" and "board": one answer per clue. */
  clues?: ClueEntry[];
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Settings {
  humanTeams: number;
  difficulty: Difficulty;
  sound: boolean;
  timer: boolean;
}

export interface TeamSetup {
  name: string;
  isAI: boolean;
}

export interface Team {
  id: number;
  name: string;
  isAI: boolean;
  /** One trophy for every rock-bottom (zero-point) answer. */
  trophies: number;
  /** Set when the team leaves the game. */
  eliminatedIn: RoundKind | null;
}

export type RoundKind = 'elim1' | 'elim2' | 'tiebreak' | 'h2h';

export interface Turn {
  teamId: number;
  /** 0 or 1: which member of the pair is answering. */
  player: 0 | 1;
  pass: 1 | 2;
}

export interface GivenAnswer {
  teamId: number;
  player: 0 | 1;
  pass: 1 | 2;
  /** What is shown on screen: the proper answer if right, the typed text if wrong. */
  display: string;
  /** Key of the matched answer, or null when wrong. */
  key: string | null;
  score: number;
  correct: boolean;
  /** No answer was given before the clock ran out. */
  timedOut: boolean;
}

export interface RoundState {
  kind: RoundKind;
  /** 1 and 2 are the elimination rounds, 3 is the head to head. */
  number: 1 | 2 | 3;
  question: Question;
  /** Keys of the clues on show, for board formats; null for open lists. */
  board: string[] | null;
  /** Board keys that have not been shown yet (used for the second pass). */
  boardReserve: string[];
  turns: Turn[];
  turnIndex: number;
  given: GivenAnswer[];
  /** Teams taking part, in playing order. */
  teamIds: number[];
  /** The elimination round a tiebreak belongs to. */
  parent: 'elim1' | 'elim2' | null;
}

export interface RoundSummary {
  kind: RoundKind;
  number: 1 | 2 | 3;
  question: Question;
  given: GivenAnswer[];
  /** Round totals by team id. */
  totals: Record<number, number>;
  /** Teams tied for the worst score; non-empty means a tiebreak follows. */
  tiedIds: number[];
  /** Team leaving the game, if this summary settles it. */
  eliminatedId: number | null;
  /** Head to head: who took the question, or null if it was drawn. */
  pointWinnerId: number | null;
  /** Head to head: set once a team has won two questions. */
  matchWinnerId: number | null;
}

export interface HeadToHead {
  teamIds: [number, number];
  wins: Record<number, number>;
  /** Number of the question being played, starting at 1. */
  questionNumber: number;
}

export interface FinalAnswer {
  display: string;
  key: string | null;
  score: number;
  correct: boolean;
  timedOut: boolean;
}

export interface FinalState {
  teamId: number;
  /** The three questions on offer. */
  options: Question[];
  question: Question | null;
  answers: FinalAnswer[];
  /** How many answers have been revealed so far. */
  revealed: number;
  won: boolean;
}

export type Phase =
  | 'setup'
  | 'roundIntro'
  | 'awaitAnswer'
  | 'reveal'
  | 'roundSummary'
  | 'finalIntro'
  | 'finalChoose'
  | 'finalAnswer'
  | 'finalReveal'
  | 'gameOver';

export interface GameState {
  phase: Phase;
  settings: Settings;
  teams: Team[];
  /** Teams still in the game, in podium order. */
  activeIds: number[];
  round: RoundState | null;
  summary: RoundSummary | null;
  h2h: HeadToHead | null;
  final: FinalState | null;
  /** The most recently judged answer, shown during the reveal. */
  lastAnswer: GivenAnswer | null;
  /** Why the last submission was not accepted, if it was not. */
  rejection: { reason: 'duplicate' | 'empty'; display: string } | null;
  usedQuestionIds: string[];
  /** Questions played in recent games, avoided where possible. */
  recentQuestionIds: string[];
  /** Questions held back for the final. */
  reservedFinalIds: string[];
  jackpot: number;
  /** Winner of the head to head. */
  championId: number | null;
}

export type GameEvent =
  | { type: 'START'; settings: Settings; teams: TeamSetup[]; jackpot: number; recentQuestionIds?: string[] }
  | { type: 'BEGIN_ROUND' }
  | { type: 'SUBMIT'; text: string }
  | { type: 'TIMEOUT'; text?: string }
  | { type: 'CONTINUE' }
  | { type: 'NEXT' }
  | { type: 'CHOOSE_CATEGORY'; questionId: string }
  | { type: 'FINAL_SUBMIT'; text: string }
  | { type: 'FINAL_TIMEOUT'; text?: string }
  | { type: 'FINAL_REVEAL' }
  | { type: 'RESET' };

/** Random number source in [0, 1); injected so games can be replayed in tests. */
export type Rng = () => number;
