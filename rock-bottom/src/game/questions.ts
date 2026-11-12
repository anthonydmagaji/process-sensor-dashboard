import rawQuestions from '../../data/questions.json';
import { findMatch, normalize, type Candidate, type MatchOptions } from '../matcher';
import type { Question } from './types';

/** The full question bank, loaded from data/questions.json. */
export const QUESTION_BANK: Question[] = rawQuestions as Question[];

/** A final question needs at least this many zero-point answers to be fair. */
export const MIN_ZERO_ANSWERS_FOR_FINAL = 3;

export function isBoardFormat(question: Question): boolean {
  return question.format !== 'open';
}

export function matchOptions(question: Question): MatchOptions {
  return { exact: question.exactSpelling === true, blocked: question.decoys ?? [] };
}

/** One answerable item of a question, whatever the format. */
export interface Entry {
  key: string;
  /** The answer as shown on screen. */
  display: string;
  score: number;
  aliases: string[];
  /** Clue text for "blank" and "clues" formats. */
  clue: string | null;
  /** Hints for the "board" format. */
  hints: string[] | null;
}

const entryCache = new WeakMap<Question, Entry[]>();
const candidateCache = new WeakMap<Question, Candidate[]>();

export function entriesOf(question: Question): Entry[] {
  const cached = entryCache.get(question);
  if (cached) return cached;

  const entries: Entry[] =
    question.format === 'open'
      ? (question.answers ?? []).map((answer, index) => ({
          key: `a${index}`,
          display: answer.text,
          score: answer.score,
          aliases: answer.aliases ?? [],
          clue: null,
          hints: null,
        }))
      : (question.clues ?? []).map((clue, index) => ({
          key: `c${index}`,
          display: clue.answer,
          score: clue.score,
          aliases: clue.aliases ?? [],
          clue: clue.clue ?? null,
          hints: clue.hints ?? null,
        }));
  entryCache.set(question, entries);
  return entries;
}

function lastWord(text: string): string {
  const words = text.trim().split(/\s+/);
  return words[words.length - 1] ?? '';
}

/**
 * Surnames that can stand in for a full name: at least three letters, not
 * shared by two answers and not already another answer in its own right.
 */
function surnameForms(entries: Entry[]): Map<string, string> {
  const owners = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.display.trim().split(/\s+/).length < 2) continue;
    const surname = normalize(lastWord(entry.display));
    if (surname.length < 3) continue;
    owners.set(surname, [...(owners.get(surname) ?? []), entry.key]);
  }
  const taken = new Set<string>();
  for (const entry of entries) {
    for (const form of [entry.display, ...entry.aliases]) taken.add(normalize(form));
  }
  const result = new Map<string, string>();
  for (const [surname, keys] of owners) {
    if (keys.length === 1 && !taken.has(surname)) result.set(keys[0], surname);
  }
  return result;
}

/** Every answer of a question in the form the matcher works with. */
export function candidatesOf(question: Question): Candidate[] {
  const cached = candidateCache.get(question);
  if (cached) return cached;

  const entries = entriesOf(question);
  const surnames = question.acceptSurname ? surnameForms(entries) : new Map<string, string>();
  const candidates = entries.map((entry) => {
    const forms = [entry.display, ...entry.aliases];
    const surname = surnames.get(entry.key);
    if (surname) forms.push(surname);
    return { key: entry.key, display: entry.display, forms, score: entry.score };
  });
  candidateCache.set(question, candidates);
  return candidates;
}

/** Candidates limited to the clues currently on the board (all of them for open lists). */
export function activeCandidates(question: Question, board: string[] | null): Candidate[] {
  const all = candidatesOf(question);
  if (!board) return all;
  const visible = new Set(board);
  return all.filter((candidate) => visible.has(candidate.key));
}

export function zeroAnswerCount(question: Question): number {
  return entriesOf(question).filter((entry) => entry.score === 0).length;
}

export function isFinalEligible(question: Question): boolean {
  return question.format === 'open' && zeroAnswerCount(question) >= MIN_ZERO_ANSWERS_FOR_FINAL;
}

/**
 * Checks one question for mistakes. Returns a list of problems, empty when the
 * question is sound. Run by the test suite over the whole bank, so a typo in
 * data/questions.json is caught before it reaches a game.
 */
export function validateQuestion(question: Question): string[] {
  const problems: string[] = [];
  const say = (message: string) => problems.push(`${question.id || '(no id)'}: ${message}`);

  if (!question.id) say('missing id');
  if (!question.category) say('missing category');
  if (!question.prompt) say('missing prompt');
  if (!['open', 'blank', 'clues', 'board'].includes(question.format)) say(`unknown format "${question.format}"`);

  if (question.format === 'open') {
    if (!question.answers?.length) say('an open question needs "answers"');
    if (question.clues) say('an open question must not have "clues"');
  } else {
    if (!question.clues?.length) say(`a ${question.format} question needs "clues"`);
    if (question.answers) say(`a ${question.format} question must not have "answers"`);
    for (const clue of question.clues ?? []) {
      if (question.format === 'board' && !(clue.hints && clue.hints.length >= 2)) {
        say(`"${clue.answer}" needs at least two hints`);
      }
      if (question.format !== 'board' && !clue.clue) say(`"${clue.answer}" needs a clue`);
      if (question.format === 'blank' && clue.clue && !clue.clue.includes('____')) {
        say(`the clue for "${clue.answer}" needs a ____ blank`);
      }
    }
  }

  const entries = entriesOf(question);
  if (entries.length < 12) say(`only ${entries.length} answers; at least 12 are needed for a full round`);

  const owners = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.display.trim()) say('an answer has no text');
    if (!Number.isInteger(entry.score) || entry.score < 0 || entry.score > 100) {
      say(`"${entry.display}" has score ${entry.score}; it must be a whole number from 0 to 100`);
    }
    for (const form of [entry.display, ...entry.aliases]) {
      const normal = normalize(form);
      if (!normal) {
        say(`"${form}" has no letters or digits`);
        continue;
      }
      const owner = owners.get(normal);
      if (owner && owner !== entry.key) say(`"${form}" is listed for two different answers`);
      owners.set(normal, entry.key);
    }
  }

  // Every answer must be reachable by typing it.
  const candidates = candidatesOf(question);
  const options = matchOptions(question);
  for (const entry of entries) {
    const match = findMatch(entry.display, candidates, options);
    if (match?.candidate.key !== entry.key) say(`typing "${entry.display}" does not find that answer`);
  }

  if (!Array.isArray(question.decoys) || question.decoys.length < 3) {
    say('needs at least three decoys (plausible wrong answers)');
  }
  for (const decoy of question.decoys ?? []) {
    const match = findMatch(decoy, candidates, options);
    if (match) say(`decoy "${decoy}" would be accepted as "${match.candidate.display}"`);
  }
  return problems;
}

/** Checks the whole bank, including that ids are unique. */
export function validateBank(bank: Question[]): string[] {
  const problems = bank.flatMap(validateQuestion);
  const seen = new Set<string>();
  for (const question of bank) {
    if (seen.has(question.id)) problems.push(`${question.id}: id is used twice`);
    seen.add(question.id);
  }
  return problems;
}
