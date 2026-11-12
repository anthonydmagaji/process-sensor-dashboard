/**
 * The game as a pure state machine: transition(state, event, context) returns
 * the next state and never touches the DOM, timers, audio or storage.
 *
 *   setup -> roundIntro -> awaitAnswer <-> reveal -> roundSummary
 *     roundSummary -> roundIntro   (tiebreak, next round, next head-to-head question)
 *     roundSummary -> finalIntro -> finalChoose -> finalAnswer -> finalReveal -> gameOver
 */
import { judgeAnswer } from '../matcher';
import {
  activeCandidates,
  candidatesOf,
  entriesOf,
  isBoardFormat,
  isFinalEligible,
  matchOptions,
} from './questions';
import { pick, shuffle } from './random';
import type {
  FinalAnswer,
  GameEvent,
  GameState,
  GivenAnswer,
  Question,
  Rng,
  RoundKind,
  RoundState,
  RoundSummary,
  Settings,
  Team,
  Turn,
} from './types';

export const JACKPOT_START = 1000;
export const JACKPOT_STEP = 250;
export const WRONG_SCORE = 100;
export const FINAL_ANSWERS = 3;
export const H2H_WINS_NEEDED = 2;
export const TEAM_COUNT = 4;
export const NO_ANSWER = 'No answer';

export interface Context {
  bank: Question[];
  rng: Rng;
}

export const DEFAULT_SETTINGS: Settings = {
  humanTeams: 1,
  difficulty: 'medium',
  sound: true,
  timer: true,
};

export function initialState(settings: Settings = DEFAULT_SETTINGS, jackpot = JACKPOT_START): GameState {
  return {
    phase: 'setup',
    settings,
    teams: [],
    activeIds: [],
    round: null,
    summary: null,
    h2h: null,
    final: null,
    lastAnswer: null,
    rejection: null,
    usedQuestionIds: [],
    recentQuestionIds: [],
    reservedFinalIds: [],
    jackpot,
    championId: null,
  };
}

/** What the jackpot should be for the next game. */
export function nextJackpot(state: GameState): number {
  if (state.phase !== 'gameOver' || !state.final) return state.jackpot;
  return state.final.won ? JACKPOT_START : state.jackpot + JACKPOT_STEP;
}

export function teamById(state: GameState, id: number): Team {
  const team = state.teams.find((candidate) => candidate.id === id);
  if (!team) throw new Error(`Unknown team ${id}`);
  return team;
}

export function currentTurn(state: GameState): Turn | null {
  if (!state.round) return null;
  return state.round.turns[state.round.turnIndex] ?? null;
}

/** Round totals by team id for the answers given so far. */
export function roundTotals(round: RoundState): Record<number, number> {
  const totals: Record<number, number> = {};
  for (const id of round.teamIds) totals[id] = 0;
  for (const answer of round.given) totals[answer.teamId] += answer.score;
  return totals;
}

export function givenKeys(given: readonly { key: string | null }[]): Set<string> {
  return new Set(given.flatMap((answer) => (answer.key ? [answer.key] : [])));
}

export function givenWrong(given: readonly { key: string | null; display: string; timedOut: boolean }[]): string[] {
  return given.filter((answer) => !answer.key && !answer.timedOut).map((answer) => answer.display);
}

// ---------------------------------------------------------------- questions

/**
 * Chooses the next question, steering away from questions played in recent
 * games and from categories and formats already seen in this one.
 */
function chooseQuestion(state: GameState, context: Context): Question {
  const used = new Set(state.usedQuestionIds);
  const reserved = new Set(state.reservedFinalIds);
  const recent = new Set(state.recentQuestionIds);
  const played = context.bank.filter((question) => used.has(question.id));
  const seenCategories = new Set(played.map((question) => question.category));
  const seenFormats = new Set(played.map((question) => question.format));

  let pool = context.bank.filter((question) => !used.has(question.id) && !reserved.has(question.id));
  if (pool.length === 0) pool = context.bank.filter((question) => !reserved.has(question.id));
  if (pool.length === 0) pool = context.bank;

  const penalty = (question: Question) =>
    (recent.has(question.id) ? 4 : 0) +
    (seenCategories.has(question.category) ? 2 : 0) +
    (seenFormats.has(question.format) ? 1 : 0);
  const best = Math.min(...pool.map(penalty));
  return pick(
    context.rng,
    pool.filter((question) => penalty(question) === best),
  );
}

/** Holds back three final questions from three different categories. */
function reserveFinalQuestions(bank: Question[], recentIds: string[], rng: Rng): string[] {
  const recent = new Set(recentIds);
  const eligible = shuffle(rng, bank.filter(isFinalEligible));
  // Fresh questions first; the sort is stable so the shuffle still decides ties.
  eligible.sort((a, b) => Number(recent.has(a.id)) - Number(recent.has(b.id)));

  const chosen: Question[] = [];
  for (const question of eligible) {
    if (chosen.length === FINAL_ANSWERS) break;
    if (!chosen.some((other) => other.category === question.category)) chosen.push(question);
  }
  for (const question of eligible) {
    if (chosen.length === FINAL_ANSWERS) break;
    if (!chosen.includes(question)) chosen.push(question);
  }
  return chosen.map((question) => question.id);
}

// ------------------------------------------------------------------- rounds

function buildTurns(kind: RoundKind, teamIds: number[], questionNumber: number): Turn[] {
  if (kind === 'elim1' || kind === 'elim2') {
    // The pair swap who goes first between the two elimination rounds.
    const first: 0 | 1 = kind === 'elim1' ? 0 : 1;
    const second: 0 | 1 = first === 0 ? 1 : 0;
    return [
      ...teamIds.map((teamId): Turn => ({ teamId, player: first, pass: 1 })),
      ...teamIds
        .slice()
        .reverse()
        .map((teamId): Turn => ({ teamId, player: second, pass: 2 })),
    ];
  }
  const player: 0 | 1 = questionNumber % 2 === 1 ? 0 : 1;
  return teamIds.map((teamId): Turn => ({ teamId, player, pass: 1 }));
}

function boardSize(kind: RoundKind, total: number): number {
  return Math.min(total, kind === 'elim1' || kind === 'elim2' ? 8 : 6);
}

function startRound(
  state: GameState,
  context: Context,
  kind: RoundKind,
  teamIds: number[],
  parent: 'elim1' | 'elim2' | null,
): GameState {
  const question = chooseQuestion(state, context);
  const number: 1 | 2 | 3 = kind === 'h2h' ? 3 : (parent ?? kind) === 'elim1' ? 1 : 2;

  let board: string[] | null = null;
  let boardReserve: string[] = [];
  if (isBoardFormat(question)) {
    const keys = shuffle(
      context.rng,
      entriesOf(question).map((entry) => entry.key),
    );
    const size = boardSize(kind, keys.length);
    board = keys.slice(0, size);
    boardReserve = keys.slice(size);
  }

  const round: RoundState = {
    kind,
    number,
    question,
    board,
    boardReserve,
    turns: buildTurns(kind, teamIds, state.h2h?.questionNumber ?? 1),
    turnIndex: 0,
    given: [],
    teamIds,
    parent,
  };
  return {
    ...state,
    phase: 'roundIntro',
    round,
    summary: null,
    lastAnswer: null,
    rejection: null,
    usedQuestionIds: [...state.usedQuestionIds, question.id],
  };
}

function awardTrophy(teams: Team[], teamId: number): Team[] {
  return teams.map((team) => (team.id === teamId ? { ...team, trophies: team.trophies + 1 } : team));
}

function acceptAnswer(state: GameState, answer: GivenAnswer): GameState {
  const round = state.round as RoundState;
  const earnedTrophy = answer.correct && answer.score === 0;
  return {
    ...state,
    phase: 'reveal',
    round: { ...round, given: [...round.given, answer] },
    teams: earnedTrophy ? awardTrophy(state.teams, answer.teamId) : state.teams,
    lastAnswer: answer,
    rejection: null,
  };
}

function submitAnswer(state: GameState, text: string, timedOut: boolean): GameState {
  const round = state.round;
  const turn = currentTurn(state);
  if (state.phase !== 'awaitAnswer' || !round || !turn) return state;

  const judgement = judgeAnswer(
    text,
    activeCandidates(round.question, round.board),
    givenKeys(round.given),
    givenWrong(round.given),
    matchOptions(round.question),
  );
  const base = { teamId: turn.teamId, player: turn.player, pass: turn.pass };

  if (judgement.kind === 'correct') {
    return acceptAnswer(state, {
      ...base,
      display: judgement.display,
      key: judgement.key,
      score: judgement.score,
      correct: true,
      timedOut: false,
    });
  }
  if (judgement.kind === 'wrong') {
    return acceptAnswer(state, {
      ...base,
      display: judgement.display,
      key: null,
      score: WRONG_SCORE,
      correct: false,
      timedOut: false,
    });
  }
  if (timedOut) {
    // Out of time with nothing usable in the box.
    return acceptAnswer(state, {
      ...base,
      display: NO_ANSWER,
      key: null,
      score: WRONG_SCORE,
      correct: false,
      timedOut: true,
    });
  }
  return {
    ...state,
    rejection: {
      reason: judgement.kind,
      display: judgement.kind === 'duplicate' ? judgement.display : '',
    },
  };
}

/** Deals a fresh board for the second pass: unseen clues first, then leftovers. */
function refreshBoard(round: RoundState): Pick<RoundState, 'board' | 'boardReserve'> {
  if (!round.board) return { board: null, boardReserve: [] };
  const answered = givenKeys(round.given);
  const size = round.board.length;
  const fresh = round.boardReserve.slice(0, size);
  const leftovers = round.board.filter((key) => !answered.has(key));
  const board = [...fresh, ...leftovers].slice(0, size);
  return { board, boardReserve: round.boardReserve.slice(fresh.length) };
}

function summarise(state: GameState): GameState {
  const round = state.round as RoundState;
  const totals = roundTotals(round);
  const summary: RoundSummary = {
    kind: round.kind,
    number: round.number,
    question: round.question,
    given: round.given,
    totals,
    tiedIds: [],
    eliminatedId: null,
    pointWinnerId: null,
    matchWinnerId: null,
  };

  if (round.kind === 'h2h' && state.h2h) {
    const [a, b] = state.h2h.teamIds;
    const wins = { ...state.h2h.wins };
    if (totals[a] !== totals[b]) {
      summary.pointWinnerId = totals[a] < totals[b] ? a : b;
      wins[summary.pointWinnerId] += 1;
      if (wins[summary.pointWinnerId] >= H2H_WINS_NEEDED) summary.matchWinnerId = summary.pointWinnerId;
    }
    return { ...state, phase: 'roundSummary', summary, h2h: { ...state.h2h, wins } };
  }

  const worst = Math.max(...round.teamIds.map((id) => totals[id]));
  const losers = round.teamIds.filter((id) => totals[id] === worst);
  if (losers.length === 1) summary.eliminatedId = losers[0];
  else summary.tiedIds = losers;
  return { ...state, phase: 'roundSummary', summary };
}

function continueAfterReveal(state: GameState): GameState {
  const round = state.round;
  if (state.phase !== 'reveal' || !round) return state;

  const nextIndex = round.turnIndex + 1;
  if (nextIndex >= round.turns.length) return summarise(state);

  const passChanged = round.turns[nextIndex].pass !== round.turns[round.turnIndex].pass;
  return {
    ...state,
    phase: 'awaitAnswer',
    round: { ...round, turnIndex: nextIndex, ...(passChanged ? refreshBoard(round) : {}) },
    rejection: null,
  };
}

function eliminate(state: GameState, teamId: number, kind: RoundKind): GameState {
  return {
    ...state,
    teams: state.teams.map((team) => (team.id === teamId ? { ...team, eliminatedIn: kind } : team)),
    activeIds: state.activeIds.filter((id) => id !== teamId),
  };
}

function startFinal(state: GameState, context: Context, championId: number): GameState {
  const options = state.reservedFinalIds
    .map((id) => context.bank.find((question) => question.id === id))
    .filter((question): question is Question => Boolean(question));
  return {
    ...state,
    phase: 'finalIntro',
    championId,
    round: null,
    final: { teamId: championId, options, question: null, answers: [], revealed: 0, won: false },
    rejection: null,
    lastAnswer: null,
  };
}

function afterSummary(state: GameState, context: Context): GameState {
  const summary = state.summary;
  const round = state.round;
  if (!summary || !round) return state;

  if (round.kind === 'h2h' && state.h2h) {
    if (summary.matchWinnerId !== null) {
      const loser = state.h2h.teamIds.find((id) => id !== summary.matchWinnerId) as number;
      return startFinal(eliminate(state, loser, 'h2h'), context, summary.matchWinnerId);
    }
    const h2h = { ...state.h2h, questionNumber: state.h2h.questionNumber + 1 };
    // Alternate who answers first.
    const order = h2h.questionNumber % 2 === 1 ? h2h.teamIds : [h2h.teamIds[1], h2h.teamIds[0]];
    return startRound({ ...state, h2h }, context, 'h2h', order, null);
  }

  const parent = round.parent ?? (round.kind as 'elim1' | 'elim2');
  if (summary.tiedIds.length > 1) return startRound(state, context, 'tiebreak', summary.tiedIds, parent);
  if (summary.eliminatedId === null) return state;

  const reduced = eliminate(state, summary.eliminatedId, parent);
  if (parent === 'elim1') return startRound(reduced, context, 'elim2', reduced.activeIds, null);

  const [a, b] = reduced.activeIds;
  const withMatch: GameState = {
    ...reduced,
    h2h: { teamIds: [a, b], wins: { [a]: 0, [b]: 0 }, questionNumber: 1 },
  };
  return startRound(withMatch, context, 'h2h', [a, b], null);
}

// -------------------------------------------------------------------- final

function noFinalAnswer(): FinalAnswer {
  return { display: NO_ANSWER, key: null, score: WRONG_SCORE, correct: false, timedOut: true };
}

function submitFinalAnswer(state: GameState, text: string, timedOut: boolean): GameState {
  const final = state.final;
  if (state.phase !== 'finalAnswer' || !final?.question) return state;

  const judgement = judgeAnswer(
    text,
    candidatesOf(final.question),
    givenKeys(final.answers),
    givenWrong(final.answers),
    matchOptions(final.question),
  );

  let answers = final.answers;
  if (judgement.kind === 'correct') {
    answers = [
      ...answers,
      { display: judgement.display, key: judgement.key, score: judgement.score, correct: true, timedOut: false },
    ];
  } else if (judgement.kind === 'wrong') {
    answers = [
      ...answers,
      { display: judgement.display, key: null, score: WRONG_SCORE, correct: false, timedOut: false },
    ];
  } else if (!timedOut) {
    return {
      ...state,
      rejection: {
        reason: judgement.kind,
        display: judgement.kind === 'duplicate' ? judgement.display : '',
      },
    };
  }

  // When the clock runs out, every answer not yet given is lost.
  if (timedOut) {
    while (answers.length < FINAL_ANSWERS) answers = [...answers, noFinalAnswer()];
  }
  const complete = answers.length >= FINAL_ANSWERS;
  return {
    ...state,
    phase: complete ? 'finalReveal' : 'finalAnswer',
    final: { ...final, answers },
    rejection: null,
  };
}

function revealFinalAnswer(state: GameState): GameState {
  const final = state.final;
  if (state.phase !== 'finalReveal' || !final) return state;
  if (final.won || final.revealed >= final.answers.length) return state;

  const answer = final.answers[final.revealed];
  const won = answer.correct && answer.score === 0;
  return {
    ...state,
    final: { ...final, revealed: final.revealed + 1, won },
    teams: won ? awardTrophy(state.teams, final.teamId) : state.teams,
  };
}

/** True once the final is settled: the jackpot is won or all answers are shown. */
export function finalIsSettled(state: GameState): boolean {
  const final = state.final;
  return Boolean(final && (final.won || final.revealed >= FINAL_ANSWERS));
}

// --------------------------------------------------------------- transition

export function transition(state: GameState, event: GameEvent, context: Context): GameState {
  switch (event.type) {
    case 'START': {
      if (event.teams.length !== TEAM_COUNT) throw new Error(`A game needs exactly ${TEAM_COUNT} teams`);
      const teams: Team[] = event.teams.map((setup, id) => ({
        id,
        name: setup.name,
        isAI: setup.isAI,
        trophies: 0,
        eliminatedIn: null,
      }));
      const recent = event.recentQuestionIds ?? [];
      const started: GameState = {
        ...initialState(event.settings, event.jackpot),
        teams,
        activeIds: teams.map((team) => team.id),
        recentQuestionIds: recent,
        reservedFinalIds: reserveFinalQuestions(context.bank, recent, context.rng),
      };
      return startRound(started, context, 'elim1', started.activeIds, null);
    }

    case 'BEGIN_ROUND':
      return state.phase === 'roundIntro' ? { ...state, phase: 'awaitAnswer' } : state;

    case 'SUBMIT':
      return submitAnswer(state, event.text, false);

    case 'TIMEOUT':
      return submitAnswer(state, event.text ?? '', true);

    case 'CONTINUE':
      return continueAfterReveal(state);

    case 'NEXT':
      if (state.phase === 'roundSummary') return afterSummary(state, context);
      if (state.phase === 'finalIntro') return { ...state, phase: 'finalChoose' };
      if (state.phase === 'finalReveal' && finalIsSettled(state)) return { ...state, phase: 'gameOver' };
      return state;

    case 'CHOOSE_CATEGORY': {
      const final = state.final;
      if (state.phase !== 'finalChoose' || !final) return state;
      const question = final.options.find((option) => option.id === event.questionId);
      if (!question) return state;
      return {
        ...state,
        phase: 'finalAnswer',
        final: { ...final, question },
        usedQuestionIds: [...state.usedQuestionIds, question.id],
      };
    }

    case 'FINAL_SUBMIT':
      return submitFinalAnswer(state, event.text, false);

    case 'FINAL_TIMEOUT':
      return submitFinalAnswer(state, event.text ?? '', true);

    case 'FINAL_REVEAL':
      return revealFinalAnswer(state);

    case 'RESET':
      return initialState(state.settings, nextJackpot(state));
  }
}
