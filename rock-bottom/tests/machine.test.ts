import { describe, expect, it } from 'vitest';
import { chooseAiAnswer } from '../src/game/ai';
import { Commentator, allLines, bandFor } from '../src/game/commentary';
import {
  DEFAULT_SETTINGS,
  JACKPOT_START,
  JACKPOT_STEP,
  NO_ANSWER,
  currentTurn,
  finalIsSettled,
  givenKeys,
  givenWrong,
  initialState,
  nextJackpot,
  roundTotals,
  transition,
  type Context,
} from '../src/game/machine';
import { QUESTION_BANK, activeCandidates, candidatesOf, entriesOf, isFinalEligible } from '../src/game/questions';
import { seededRng } from '../src/game/random';
import { Storage, type KeyValueStore } from '../src/game/storage';
import type { Difficulty, GameEvent, GameState, Question, TeamSetup } from '../src/game/types';

const TEAMS: TeamSetup[] = [
  { name: 'Alpha', isAI: false },
  { name: 'Bravo', isAI: true },
  { name: 'Charlie', isAI: true },
  { name: 'Delta', isAI: true },
];

function context(seed: number, bank: Question[] = QUESTION_BANK): Context {
  return { bank, rng: seededRng(seed) };
}

function start(seed = 1, jackpot = JACKPOT_START, bank: Question[] = QUESTION_BANK) {
  const ctx = context(seed, bank);
  const state = transition(
    initialState(),
    { type: 'START', settings: DEFAULT_SETTINGS, teams: TEAMS, jackpot },
    ctx,
  );
  const send = (current: GameState, event: GameEvent) => transition(current, event, ctx);
  return { state, ctx, send };
}

/** A correct answer for the current turn, chosen by score rank (0 = lowest). */
function answerRanked(state: GameState, rank: number): string {
  const round = state.round!;
  const taken = givenKeys(round.given);
  const open = activeCandidates(round.question, round.board)
    .filter((candidate) => !taken.has(candidate.key))
    .sort((a, b) => a.score - b.score);
  return open[Math.min(rank, open.length - 1)].display;
}

/** Plays one answer and moves past the reveal. */
function play(state: GameState, send: (s: GameState, e: GameEvent) => GameState, text: string): GameState {
  const revealed = send(state, { type: 'SUBMIT', text });
  expect(revealed.phase).toBe('reveal');
  return send(revealed, { type: 'CONTINUE' });
}

/** Plays a whole game with every team answered by the computer. */
function simulate(seed: number, difficulty: Difficulty, jackpot = JACKPOT_START) {
  const ctx = context(seed);
  const rng = seededRng(seed + 1000);
  let state = transition(
    initialState(),
    { type: 'START', settings: { ...DEFAULT_SETTINGS, difficulty }, teams: TEAMS, jackpot },
    ctx,
  );
  const phases: string[] = [state.phase];
  let steps = 0;
  const send = (event: GameEvent) => {
    state = transition(state, event, ctx);
    phases.push(state.phase);
  };

  while (state.phase !== 'gameOver') {
    if (++steps > 600) throw new Error(`game ${seed} did not finish`);
    switch (state.phase) {
      case 'roundIntro':
        send({ type: 'BEGIN_ROUND' });
        break;
      case 'awaitAnswer': {
        const round = state.round!;
        const taken = givenKeys(round.given);
        const open = activeCandidates(round.question, round.board).filter((c) => !taken.has(c.key));
        const choice = chooseAiAnswer(open, round.question.decoys, givenWrong(round.given), difficulty, rng);
        send({ type: 'SUBMIT', text: choice.text });
        if ((state as GameState).phase !== 'reveal') throw new Error(`"${choice.text}" was rejected on ${round.question.id}`);
        break;
      }
      case 'reveal':
        send({ type: 'CONTINUE' });
        break;
      case 'roundSummary':
      case 'finalIntro':
        send({ type: 'NEXT' });
        break;
      case 'finalChoose':
        send({ type: 'CHOOSE_CATEGORY', questionId: state.final!.options[0].id });
        break;
      case 'finalAnswer': {
        const final = state.final!;
        const taken = givenKeys(final.answers);
        const open = candidatesOf(final.question!).filter((c) => !taken.has(c.key));
        const choice = chooseAiAnswer(open, final.question!.decoys, givenWrong(final.answers), difficulty, rng);
        send({ type: 'FINAL_SUBMIT', text: choice.text });
        break;
      }
      case 'finalReveal':
        send(finalIsSettled(state) ? { type: 'NEXT' } : { type: 'FINAL_REVEAL' });
        break;
      default:
        throw new Error(`unexpected phase ${state.phase}`);
    }
  }
  return { state, phases };
}

describe('starting a game', () => {
  it('opens round one with four teams and a question', () => {
    const { state } = start();
    expect(state.phase).toBe('roundIntro');
    expect(state.teams).toHaveLength(4);
    expect(state.activeIds).toEqual([0, 1, 2, 3]);
    expect(state.round?.kind).toBe('elim1');
    expect(state.round?.number).toBe(1);
  });

  it('refuses the wrong number of teams', () => {
    expect(() =>
      transition(
        initialState(),
        { type: 'START', settings: DEFAULT_SETTINGS, teams: TEAMS.slice(0, 3), jackpot: JACKPOT_START },
        context(1),
      ),
    ).toThrow();
  });

  it('reserves three final questions from three different categories', () => {
    const { state } = start(7);
    const reserved = state.reservedFinalIds.map((id) => QUESTION_BANK.find((q) => q.id === id)!);
    expect(reserved).toHaveLength(3);
    expect(reserved.every(isFinalEligible)).toBe(true);
    expect(new Set(reserved.map((q) => q.category)).size).toBe(3);
    expect(state.reservedFinalIds).not.toContain(state.round!.question.id);
  });

  it('gives each player one turn per elimination round, second pass in reverse order', () => {
    const { state } = start();
    const turns = state.round!.turns;
    expect(turns.map((t) => t.teamId)).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(turns.map((t) => t.pass)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect(turns.map((t) => t.player)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });
});

describe('answering', () => {
  it('scores a correct answer and moves to the reveal', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    const text = answerRanked(state, 0);
    const next = send(state, { type: 'SUBMIT', text });
    expect(next.phase).toBe('reveal');
    expect(next.lastAnswer?.correct).toBe(true);
    expect(next.lastAnswer?.display).toBe(text);
    expect(next.lastAnswer?.teamId).toBe(0);
  });

  it('scores a wrong answer 100', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    const next = send(state, { type: 'SUBMIT', text: 'Definitely Not Right Zzz' });
    expect(next.lastAnswer).toMatchObject({ correct: false, score: 100, key: null });
  });

  it('rejects an empty answer without using the turn', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    const next = send(state, { type: 'SUBMIT', text: '   ' });
    expect(next.phase).toBe('awaitAnswer');
    expect(next.rejection?.reason).toBe('empty');
    expect(next.round!.given).toHaveLength(0);
  });

  it('rejects an answer already given in the round, right or wrong', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    // Open lists keep the same answers for the whole round; a board changes on the second pass.
    const text = answerRanked(state, 0);
    state = play(state, send, text);
    const repeat = send(state, { type: 'SUBMIT', text: text.toUpperCase() });
    expect(repeat.phase).toBe('awaitAnswer');
    expect(repeat.rejection).toEqual({ reason: 'duplicate', display: text });
    expect(currentTurn(repeat)?.teamId).toBe(1);

    state = play(state, send, 'Qwertyuiop Wrong');
    const repeatWrong = send(state, { type: 'SUBMIT', text: 'qwertyuiop wrong!' });
    expect(repeatWrong.rejection?.reason).toBe('duplicate');
    expect(currentTurn(repeatWrong)?.teamId).toBe(2);
  });

  it('clears a rejection once a valid answer arrives', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    state = send(state, { type: 'SUBMIT', text: '' });
    expect(state.rejection).not.toBeNull();
    state = send(state, { type: 'SUBMIT', text: answerRanked(state, 0) });
    expect(state.rejection).toBeNull();
  });

  it('scores a timeout with nothing typed as no answer', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    const next = send(state, { type: 'TIMEOUT' });
    expect(next.phase).toBe('reveal');
    expect(next.lastAnswer).toMatchObject({ display: NO_ANSWER, score: 100, timedOut: true });
  });

  it('judges whatever was typed when the clock runs out', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    const text = answerRanked(state, 0);
    const next = send(state, { type: 'TIMEOUT', text });
    expect(next.lastAnswer).toMatchObject({ display: text, correct: true, timedOut: false });
  });

  it('lets two timeouts in a row both stand', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    state = send(send(state, { type: 'TIMEOUT' }), { type: 'CONTINUE' });
    state = send(state, { type: 'TIMEOUT' });
    expect(state.phase).toBe('reveal');
    expect(state.round!.given).toHaveLength(2);
  });

  it('ignores events that do not belong to the current phase', () => {
    const { state, send } = start();
    expect(send(state, { type: 'SUBMIT', text: 'x' })).toBe(state);
    expect(send(state, { type: 'CONTINUE' })).toBe(state);
    expect(send(state, { type: 'FINAL_REVEAL' })).toBe(state);
  });
});

describe('boards', () => {
  const boardBank = QUESTION_BANK.filter((q) => q.format !== 'open' || isFinalEligible(q));

  it('shows eight clues and deals a fresh board for the second pass', () => {
    let { state, send } = start(3, JACKPOT_START, boardBank);
    // Keep drawing games until round one is a board question.
    let seed = 3;
    while (state.round!.question.format === 'open') ({ state, send } = start(++seed, JACKPOT_START, boardBank));

    state = send(state, { type: 'BEGIN_ROUND' });
    const firstBoard = state.round!.board!;
    expect(firstBoard).toHaveLength(8);
    expect(new Set(firstBoard).size).toBe(8);

    const hidden = entriesOf(state.round!.question).find((entry) => !firstBoard.includes(entry.key))!;
    const offBoard = send(state, { type: 'SUBMIT', text: hidden.display });
    expect(offBoard.lastAnswer?.correct).toBe(false);

    for (let i = 0; i < 4; i++) state = play(state, send, answerRanked(state, 0));
    const secondBoard = state.round!.board!;
    expect(secondBoard).toHaveLength(8);
    expect(secondBoard.some((key) => firstBoard.includes(key))).toBe(false);
  });
});

describe('elimination', () => {
  it('eliminates the team with the highest total', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    // Team 2 gets both answers wrong; everyone else answers correctly.
    for (let turn = 0; turn < 8; turn++) {
      const teamId = currentTurn(state)!.teamId;
      state = play(state, send, teamId === 2 ? `Wrong answer ${turn}` : answerRanked(state, 0));
    }
    expect(state.phase).toBe('roundSummary');
    expect(state.summary?.totals[2]).toBe(200);
    expect(state.summary?.eliminatedId).toBe(2);
    expect(state.summary?.tiedIds).toEqual([]);

    state = send(state, { type: 'NEXT' });
    expect(state.round?.kind).toBe('elim2');
    expect(state.activeIds).toEqual([0, 1, 3]);
    expect(state.teams[2].eliminatedIn).toBe('elim1');
    expect(state.round!.turns.map((t) => t.teamId)).toEqual([0, 1, 3, 3, 1, 0]);
    expect(state.round!.turns.map((t) => t.player)).toEqual([1, 1, 1, 0, 0, 0]);
  });

  it('plays a tiebreak when teams share the highest total', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    for (let turn = 0; turn < 8; turn++) {
      const teamId = currentTurn(state)!.teamId;
      state = play(state, send, teamId === 1 || teamId === 3 ? `Wrong answer ${turn}` : answerRanked(state, 0));
    }
    expect(state.summary?.eliminatedId).toBeNull();
    expect(state.summary?.tiedIds).toEqual([1, 3]);

    state = send(state, { type: 'NEXT' });
    expect(state.round?.kind).toBe('tiebreak');
    expect(state.round?.parent).toBe('elim1');
    expect(state.round?.teamIds).toEqual([1, 3]);
    expect(state.round?.turns).toHaveLength(2);
    expect(state.activeIds).toEqual([0, 1, 2, 3]);

    state = send(state, { type: 'BEGIN_ROUND' });
    state = play(state, send, answerRanked(state, 0));
    state = play(state, send, 'Completely wrong');
    expect(state.summary?.eliminatedId).toBe(3);

    state = send(state, { type: 'NEXT' });
    expect(state.round?.kind).toBe('elim2');
    expect(state.teams[3].eliminatedIn).toBe('elim1');
    expect(state.activeIds).toEqual([0, 1, 2]);
  });

  it('repeats the tiebreak while the teams stay level', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    for (let turn = 0; turn < 8; turn++) state = play(state, send, `Wrong answer ${turn}`);
    expect(state.summary?.tiedIds).toEqual([0, 1, 2, 3]);

    state = send(send(state, { type: 'NEXT' }), { type: 'BEGIN_ROUND' });
    expect(state.round?.turns).toHaveLength(4);
    // Two teams wrong again, two right: only the wrong pair go on.
    state = play(state, send, answerRanked(state, 0));
    state = play(state, send, 'Nope one');
    state = play(state, send, answerRanked(state, 0));
    state = play(state, send, 'Nope two');
    expect(state.summary?.tiedIds).toEqual([1, 3]);

    state = send(state, { type: 'NEXT' });
    expect(state.round?.kind).toBe('tiebreak');
    expect(state.round?.teamIds).toEqual([1, 3]);
    expect(state.round?.parent).toBe('elim1');
  });
});

/** Fast-forwards to the head to head by knocking out teams 3 then 2. */
function toHeadToHead(seed = 5) {
  let { state, send, ctx } = start(seed);
  for (const loser of [3, 2]) {
    state = send(state, { type: 'BEGIN_ROUND' });
    while (state.phase === 'awaitAnswer') {
      const teamId = currentTurn(state)!.teamId;
      state = play(state, send, teamId === loser ? `Wrong ${state.round!.given.length}` : answerRanked(state, 0));
    }
    state = send(state, { type: 'NEXT' });
  }
  return { state, send, ctx };
}

describe('head to head', () => {
  it('starts with the last two teams', () => {
    const { state } = toHeadToHead();
    expect(state.round?.kind).toBe('h2h');
    expect(state.round?.number).toBe(3);
    expect(state.h2h).toMatchObject({ teamIds: [0, 1], wins: { 0: 0, 1: 0 }, questionNumber: 1 });
    expect(state.round?.turns).toHaveLength(2);
  });

  it('gives the question to the lower score and the match to the first team with two', () => {
    let { state, send } = toHeadToHead();
    state = send(state, { type: 'BEGIN_ROUND' });
    state = play(state, send, answerRanked(state, 0));
    state = play(state, send, 'Wrong');
    expect(state.summary?.pointWinnerId).toBe(0);
    expect(state.summary?.matchWinnerId).toBeNull();
    expect(state.h2h?.wins).toEqual({ 0: 1, 1: 0 });

    state = send(state, { type: 'NEXT' });
    expect(state.h2h?.questionNumber).toBe(2);
    // The other team answers first on the second question.
    expect(state.round?.turns.map((t) => t.teamId)).toEqual([1, 0]);
    state = send(state, { type: 'BEGIN_ROUND' });
    state = play(state, send, 'Wrong');
    state = play(state, send, answerRanked(state, 0));
    expect(state.summary?.matchWinnerId).toBe(0);

    state = send(state, { type: 'NEXT' });
    expect(state.phase).toBe('finalIntro');
    expect(state.championId).toBe(0);
    expect(state.teams[1].eliminatedIn).toBe('h2h');
    expect(state.final?.teamId).toBe(0);
    expect(state.final?.options).toHaveLength(3);
  });

  it('replays a drawn question without awarding it', () => {
    let { state, send } = toHeadToHead();
    state = send(state, { type: 'BEGIN_ROUND' });
    state = play(state, send, 'Wrong A');
    state = play(state, send, 'Wrong B');
    expect(state.summary?.pointWinnerId).toBeNull();
    expect(state.h2h?.wins).toEqual({ 0: 0, 1: 0 });
    const firstQuestion = state.round!.question.id;

    state = send(state, { type: 'NEXT' });
    expect(state.round?.kind).toBe('h2h');
    expect(state.round!.question.id).not.toBe(firstQuestion);
  });
});

function toFinal(seed = 5, jackpot = JACKPOT_START) {
  let { state, send } = toHeadToHead(seed);
  state = { ...state, jackpot };
  while (state.phase !== 'finalIntro') {
    state = send(state, { type: 'BEGIN_ROUND' });
    const first = currentTurn(state)!.teamId;
    state = play(state, send, first === 0 ? answerRanked(state, 0) : 'Wrong');
    state = play(state, send, first === 0 ? 'Wrong' : answerRanked(state, 0));
    state = send(state, { type: 'NEXT' });
  }
  state = send(state, { type: 'NEXT' });
  expect(state.phase).toBe('finalChoose');
  state = send(state, { type: 'CHOOSE_CATEGORY', questionId: state.final!.options[1].id });
  expect(state.phase).toBe('finalAnswer');
  return { state, send };
}

function finalAnswers(state: GameState, zero: boolean): string[] {
  return entriesOf(state.final!.question!)
    .filter((entry) => (zero ? entry.score === 0 : entry.score > 0))
    .map((entry) => entry.display);
}

describe('final', () => {
  it('ignores a category that was not offered', () => {
    let { state, send } = toHeadToHead();
    while (state.phase !== 'finalIntro') {
      state = send(state, { type: 'BEGIN_ROUND' });
      const first = currentTurn(state)!.teamId;
      state = play(state, send, first === 0 ? answerRanked(state, 0) : 'Wrong');
      state = play(state, send, first === 0 ? 'Wrong' : answerRanked(state, 0));
      state = send(state, { type: 'NEXT' });
    }
    state = send(state, { type: 'NEXT' });
    expect(send(state, { type: 'CHOOSE_CATEGORY', questionId: 'not-a-question' })).toBe(state);
  });

  it('collects three answers, rejecting repeats', () => {
    let { state, send } = toFinal();
    const [a, b, c] = finalAnswers(state, false);
    state = send(state, { type: 'FINAL_SUBMIT', text: a });
    expect(state.final?.answers).toHaveLength(1);
    const repeat = send(state, { type: 'FINAL_SUBMIT', text: a });
    expect(repeat.rejection?.reason).toBe('duplicate');
    expect(repeat.final?.answers).toHaveLength(1);
    state = send(state, { type: 'FINAL_SUBMIT', text: b });
    expect(state.phase).toBe('finalAnswer');
    state = send(state, { type: 'FINAL_SUBMIT', text: c });
    expect(state.phase).toBe('finalReveal');
    expect(state.final?.answers).toHaveLength(3);
  });

  it('loses the jackpot when no answer scores zero, and rolls it over', () => {
    let { state, send } = toFinal(5, 1500);
    for (const text of finalAnswers(state, false).slice(0, 3)) state = send(state, { type: 'FINAL_SUBMIT', text });
    expect(send(state, { type: 'NEXT' })).toBe(state); // nothing revealed yet
    for (let i = 0; i < 3; i++) state = send(state, { type: 'FINAL_REVEAL' });
    expect(state.final).toMatchObject({ revealed: 3, won: false });
    expect(finalIsSettled(state)).toBe(true);
    state = send(state, { type: 'NEXT' });
    expect(state.phase).toBe('gameOver');
    expect(nextJackpot(state)).toBe(1500 + JACKPOT_STEP);
    expect(send(state, { type: 'RESET' })).toMatchObject({ phase: 'setup', jackpot: 1750 });
  });

  it('wins the jackpot with a zero-point answer and awards a trophy', () => {
    let { state, send } = toFinal(5, 2250);
    const trophiesBefore = state.teams[0].trophies;
    const [high] = finalAnswers(state, false);
    const [zero] = finalAnswers(state, true);
    state = send(state, { type: 'FINAL_SUBMIT', text: high });
    state = send(state, { type: 'FINAL_SUBMIT', text: zero });
    state = send(state, { type: 'FINAL_SUBMIT', text: 'Some wrong answer' });
    state = send(state, { type: 'FINAL_REVEAL' });
    expect(state.final?.won).toBe(false);
    state = send(state, { type: 'FINAL_REVEAL' });
    expect(state.final).toMatchObject({ revealed: 2, won: true });
    expect(state.teams[0].trophies).toBe(trophiesBefore + 1);
    // Once won, there is nothing more to reveal.
    expect(send(state, { type: 'FINAL_REVEAL' })).toBe(state);
    state = send(state, { type: 'NEXT' });
    expect(state.phase).toBe('gameOver');
    expect(nextJackpot(state)).toBe(JACKPOT_START);
  });

  it('forfeits unanswered slots when the clock runs out', () => {
    let { state, send } = toFinal();
    const [a] = finalAnswers(state, false);
    state = send(state, { type: 'FINAL_SUBMIT', text: a });
    state = send(state, { type: 'FINAL_TIMEOUT', text: '' });
    expect(state.phase).toBe('finalReveal');
    expect(state.final?.answers.map((answer) => answer.display)).toEqual([a, NO_ANSWER, NO_ANSWER]);
  });

  it('keeps what was typed when the clock runs out', () => {
    let { state, send } = toFinal();
    const [zero] = finalAnswers(state, true);
    state = send(state, { type: 'FINAL_TIMEOUT', text: zero });
    expect(state.final?.answers[0]).toMatchObject({ display: zero, correct: true, score: 0 });
    expect(state.final?.answers).toHaveLength(3);
  });
});

describe('trophies', () => {
  it('awards a trophy for a zero-point answer in a round', () => {
    // Find a seed whose first question has a zero-point answer on offer.
    for (let seed = 1; seed < 60; seed++) {
      let { state, send } = start(seed);
      state = send(state, { type: 'BEGIN_ROUND' });
      const zero = activeCandidates(state.round!.question, state.round!.board).find((c) => c.score === 0);
      if (!zero) continue;
      state = send(state, { type: 'SUBMIT', text: zero.display });
      expect(state.teams[0].trophies).toBe(1);
      expect(state.teams[1].trophies).toBe(0);
      return;
    }
    throw new Error('no seed produced a zero-point answer');
  });
});

describe('question selection', () => {
  it('never repeats a question within a game', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { state } = simulate(seed, 'medium');
      expect(new Set(state.usedQuestionIds).size, `seed ${seed}`).toBe(state.usedQuestionIds.length);
    }
  });

  it('avoids questions played in recent games', () => {
    const ctx = context(11);
    const recent = QUESTION_BANK.slice(0, 30).map((q) => q.id);
    const state = transition(
      initialState(),
      { type: 'START', settings: DEFAULT_SETTINGS, teams: TEAMS, jackpot: JACKPOT_START, recentQuestionIds: recent },
      ctx,
    );
    expect(recent).not.toContain(state.round!.question.id);
  });

  it('roundTotals adds up each team', () => {
    let { state, send } = start();
    state = send(state, { type: 'BEGIN_ROUND' });
    state = play(state, send, 'Wrong');
    expect(roundTotals(state.round!)).toEqual({ 0: 100, 1: 0, 2: 0, 3: 0 });
  });
});

describe('full simulated games', () => {
  it('always reach game over with a consistent result', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
      for (let seed = 1; seed <= 60; seed++) {
        const { state } = simulate(seed, difficulty);
        const label = `${difficulty} seed ${seed}`;
        expect(state.phase, label).toBe('gameOver');
        expect(state.activeIds, label).toEqual([state.championId]);
        expect(state.teams.filter((team) => team.eliminatedIn === null), label).toHaveLength(1);
        expect(state.teams.map((team) => team.eliminatedIn).filter(Boolean).sort(), label).toEqual([
          'elim1',
          'elim2',
          'h2h',
        ]);
        expect(state.final?.teamId, label).toBe(state.championId);
        const zeroFound = state.final!.answers
          .slice(0, state.final!.revealed)
          .some((answer) => answer.correct && answer.score === 0);
        expect(state.final?.won, label).toBe(zeroFound);
        expect(nextJackpot(state), label).toBe(zeroFound ? JACKPOT_START : JACKPOT_START + JACKPOT_STEP);
      }
    }
  });

  it('visits every phase in order', () => {
    const { phases } = simulate(4, 'medium');
    const firstSeen = [...new Set(phases)];
    expect(firstSeen).toEqual([
      'roundIntro',
      'awaitAnswer',
      'reveal',
      'roundSummary',
      'finalIntro',
      'finalChoose',
      'finalAnswer',
      'finalReveal',
      'gameOver',
    ]);
  });
});

describe('computer opponents', () => {
  const question = QUESTION_BANK.find((q) => q.id === 'geo-eu-capitals')!;
  const candidates = candidatesOf(question);

  function sample(difficulty: Difficulty, runs = 4000) {
    const rng = seededRng(99);
    let total = 0;
    let wrong = 0;
    let zeros = 0;
    for (let i = 0; i < runs; i++) {
      const choice = chooseAiAnswer(candidates, question.decoys, [], difficulty, rng);
      const hit = candidates.find((c) => c.display === choice.text);
      if (!hit) wrong++;
      else if (hit.score === 0) zeros++;
      total += hit ? hit.score : 100;
    }
    return { average: total / runs, wrongRate: wrong / runs, zeroRate: zeros / runs };
  }

  it('scores lower as the difficulty rises', () => {
    const easy = sample('easy');
    const medium = sample('medium');
    const hard = sample('hard');
    expect(easy.average).toBeGreaterThan(medium.average + 8);
    expect(medium.average).toBeGreaterThan(hard.average + 8);
  });

  it('gets answers wrong more often on easy than on hard', () => {
    expect(sample('easy').wrongRate).toBeGreaterThan(0.12);
    expect(sample('hard').wrongRate).toBeLessThan(0.08);
  });

  it('finds zero-point answers often on hard and rarely on easy', () => {
    expect(sample('hard').zeroRate).toBeGreaterThan(0.2);
    expect(sample('easy').zeroRate).toBeLessThan(0.03);
  });

  it('never repeats a wrong answer already given', () => {
    const rng = seededRng(5);
    const used = question.decoys.slice(0, question.decoys.length - 1);
    for (let i = 0; i < 300; i++) {
      const choice = chooseAiAnswer(candidates, question.decoys, used, 'easy', rng);
      expect(used).not.toContain(choice.text);
    }
  });

  it('still answers when every valid answer has gone', () => {
    const choice = chooseAiAnswer([], question.decoys, [], 'hard', seededRng(1));
    expect(question.decoys).toContain(choice.text);
    expect(chooseAiAnswer([], [], [], 'hard', seededRng(1)).text).toBe('Pass');
  });
});

describe('commentary', () => {
  it('picks the band from the score', () => {
    expect(bandFor(0, true, false)).toBe('zero');
    expect(bandFor(3, true, false)).toBe('brilliant');
    expect(bandFor(12, true, false)).toBe('great');
    expect(bandFor(25, true, false)).toBe('good');
    expect(bandFor(50, true, false)).toBe('middling');
    expect(bandFor(70, true, false)).toBe('high');
    expect(bandFor(95, true, false)).toBe('huge');
    expect(bandFor(100, false, false)).toBe('wrong');
    expect(bandFor(100, false, true)).toBe('timeout');
  });

  it('uses every line in a band before repeating one, and never twice running', () => {
    const commentator = new Commentator(seededRng(3));
    const count = allLines().good.length;
    const input = { answer: 'X', team: 'T', score: 20, correct: true, timedOut: false };
    const lines = Array.from({ length: count * 3 }, () => commentator.line(input));
    expect(new Set(lines.slice(0, count)).size).toBe(count);
    for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
  });

  it('fills in the answer, team and score', () => {
    const commentator = new Commentator(seededRng(8));
    for (let i = 0; i < 30; i++) {
      const line = commentator.line({ answer: 'Vilnius', team: 'Alpha', score: 4, correct: true, timedOut: false });
      expect(line).not.toMatch(/[{}]/);
    }
  });
});

describe('storage', () => {
  function memoryStore(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
  }

  it('starts the jackpot at 1,000 and remembers changes', () => {
    const store = memoryStore();
    const storage = new Storage(store);
    expect(storage.getJackpot()).toBe(JACKPOT_START);
    storage.setJackpot(1750);
    expect(new Storage(store).getJackpot()).toBe(1750);
  });

  it('falls back to defaults when saved data is damaged or storage is missing', () => {
    const store = memoryStore();
    store.data.set('rock-bottom:jackpot', '{oops');
    store.data.set('rock-bottom:settings', '{"humanTeams":9,"difficulty":"impossible"}');
    const storage = new Storage(store);
    expect(storage.getJackpot()).toBe(JACKPOT_START);
    expect(storage.getSettings()).toEqual(DEFAULT_SETTINGS);
    const none = new Storage(null);
    expect(none.getJackpot()).toBe(JACKPOT_START);
    expect(() => none.setJackpot(2000)).not.toThrow();
  });

  it('keeps a rolling list of recent questions and running records', () => {
    const storage = new Storage(memoryStore());
    storage.addRecentQuestionIds(['a', 'b']);
    storage.addRecentQuestionIds(['b', 'c']);
    expect(storage.getRecentQuestionIds()).toEqual(['a', 'b', 'c']);
    storage.recordGame({ trophies: 2, jackpotWon: null });
    expect(storage.recordGame({ trophies: 1, jackpotWon: 1500 })).toEqual({
      gamesPlayed: 2,
      jackpotsWon: 1,
      trophies: 3,
      biggestJackpot: 1500,
    });
  });
});
