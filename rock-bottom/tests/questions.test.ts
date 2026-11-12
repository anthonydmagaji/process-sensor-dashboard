import { describe, expect, it } from 'vitest';
import {
  QUESTION_BANK,
  candidatesOf,
  entriesOf,
  isFinalEligible,
  validateBank,
  validateQuestion,
} from '../src/game/questions';
import { findMatch } from '../src/matcher';
import { matchOptions } from '../src/game/questions';
import type { Question } from '../src/game/types';

const REQUIRED_CATEGORIES = [
  'Geography',
  'Science',
  'Sport',
  'Music',
  'Film',
  'History',
  'Football',
  'UK culture',
  'Words and spelling',
  'Africa',
  'Chemistry',
  'Engineering',
];

describe('question bank', () => {
  it('has no validation problems', () => {
    expect(validateBank(QUESTION_BANK)).toEqual([]);
  });

  it('has at least 40 questions', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(40);
  });

  it('covers every required category', () => {
    const categories = new Set(QUESTION_BANK.map((question) => question.category));
    for (const category of REQUIRED_CATEGORIES) expect(categories, category).toContain(category);
  });

  it('uses all four question formats', () => {
    const formats = new Set(QUESTION_BANK.map((question) => question.format));
    expect([...formats].sort()).toEqual(['blank', 'board', 'clues', 'open']);
  });

  it('gives every question between 15 and 40 answers', () => {
    for (const question of QUESTION_BANK) {
      const count = entriesOf(question).length;
      expect(count, question.id).toBeGreaterThanOrEqual(15);
      expect(count, question.id).toBeLessThanOrEqual(40);
    }
  });

  it('offers final questions in at least three categories', () => {
    const categories = new Set(QUESTION_BANK.filter(isFinalEligible).map((question) => question.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it('accepts every listed alias', () => {
    for (const question of QUESTION_BANK) {
      const candidates = candidatesOf(question);
      for (const entry of entriesOf(question)) {
        for (const alias of entry.aliases) {
          const match = findMatch(alias, candidates, matchOptions(question));
          expect(match?.candidate.key, `${question.id}: ${alias}`).toBe(entry.key);
        }
      }
    }
  });
});

describe('surnames', () => {
  const question = QUESTION_BANK.find((q) => q.id === 'football-ballon-dor') as Question;
  const pick = (text: string) => findMatch(text, candidatesOf(question))?.candidate.display ?? null;

  it('accepts an unambiguous surname', () => {
    expect(pick('Messi')).toBe('Lionel Messi');
    expect(pick('zidane')).toBe('Zinedine Zidane');
    expect(pick('Modrić')).toBe('Luka Modric');
  });

  it('gives a shared name to the answer that owns it outright', () => {
    expect(pick('Ronaldo')).toBe('Ronaldo');
    expect(pick('Cristiano Ronaldo')).toBe('Cristiano Ronaldo');
    expect(pick('Ronaldinho')).toBe('Ronaldinho');
  });

  it('does not accept surnames when the question does not allow it', () => {
    const bond = QUESTION_BANK.find((q) => q.id === 'music-bond-themes') as Question;
    expect(findMatch('Bassey', candidatesOf(bond))).toBeNull();
  });
});

describe('validateQuestion', () => {
  const base: Question = {
    id: 'test',
    category: 'Test',
    format: 'open',
    prompt: 'Name a test answer',
    decoys: ['Wrong one', 'Wrong two', 'Wrong three'],
    answers: Array.from({ length: 12 }, (_, i) => ({ text: `Answer number ${i + 20}`, score: i })),
  };

  it('passes a sound question', () => {
    expect(validateQuestion(base)).toEqual([]);
  });

  it('reports a score outside 0 to 100', () => {
    const bad = { ...base, answers: [...base.answers!, { text: 'Too high', score: 140 }] };
    expect(validateQuestion(bad).join(' ')).toContain('must be a whole number from 0 to 100');
  });

  it('reports an alias claimed by two answers', () => {
    const bad = {
      ...base,
      answers: [...base.answers!, { text: 'Alpha', score: 1, aliases: ['Shared'] }, { text: 'Bravo', score: 2, aliases: ['Shared'] }],
    };
    expect(validateQuestion(bad).join(' ')).toContain('listed for two different answers');
  });

  it('keeps decoys from being forgiven as typos of real answers', () => {
    const eurovision = QUESTION_BANK.find((q) => q.id === 'music-eurovision') as Question;
    const candidates = candidatesOf(eurovision);
    expect(findMatch('Iceland', candidates, matchOptions(eurovision))).toBeNull();
    expect(findMatch('Ireland', candidates, matchOptions(eurovision))?.candidate.display).toBe('Ireland');
  });

  it('reports a decoy that would be accepted', () => {
    const bad = { ...base, decoys: ['Answer number 21', 'Wrong two', 'Wrong three'] };
    expect(validateQuestion(bad).join(' ')).toContain('would be accepted');
  });

  it('reports a fill-the-blank clue with no blank', () => {
    const bad: Question = {
      ...base,
      format: 'blank',
      answers: undefined,
      clues: Array.from({ length: 12 }, (_, i) => ({ clue: `Clue ${i}`, answer: `Solution ${i + 20}`, score: i })),
    };
    expect(validateQuestion(bad).join(' ')).toContain('needs a ____ blank');
  });
});
