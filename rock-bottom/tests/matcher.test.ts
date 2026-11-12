import { describe, expect, it } from 'vitest';
import {
  allowedDistance,
  editDistance,
  findMatch,
  judgeAnswer,
  normalize,
  romanToNumber,
  sameAnswer,
  type Candidate,
} from '../src/matcher';

function candidate(key: string, display: string, score: number, aliases: string[] = []): Candidate {
  return { key, display, forms: [display, ...aliases], score };
}

const countries: Candidate[] = [
  candidate('uk', 'United Kingdom', 61, ['UK', 'Great Britain', 'Britain']),
  candidate('usa', 'United States', 74, ['USA', 'US', 'United States of America', 'America']),
  candidate('niger', 'Niger', 4),
  candidate('nigeria', 'Nigeria', 38),
  candidate('mali', 'Mali', 9),
  candidate('iran', 'Iran', 22),
  candidate('iraq', 'Iraq', 25),
  candidate('austria', 'Austria', 30),
  candidate('australia', 'Australia', 66),
  candidate('gambia', 'The Gambia', 3, ['Gambia']),
  candidate('zambia', 'Zambia', 7),
  candidate('slovakia', 'Slovakia', 6),
  candidate('slovenia', 'Slovenia', 5),
  candidate('saotome', 'São Tomé and Príncipe', 0, ['Sao Tome']),
  candidate('ivory', "Côte d'Ivoire", 2, ['Ivory Coast']),
  candidate('stlucia', 'Saint Lucia', 1),
  candidate('nz', 'New Zealand', 40),
  candidate('mozambique', 'Mozambique', 8),
  candidate('kyrgyzstan', 'Kyrgyzstan', 1),
];

const titles: Candidate[] = [
  candidate('h7', 'Henry VII', 12),
  candidate('h8', 'Henry VIII', 80),
  candidate('e1', 'Elizabeth I', 55),
  candidate('e2', 'Elizabeth II', 70),
  candidate('ts', 'Toy Story', 81),
  candidate('ts2', 'Toy Story 2', 30),
  candidate('ts3', 'Toy Story 3', 26),
  candidate('who', 'The Who', 20),
  candidate('rem', 'R.E.M.', 15, ['REM']),
  candidate('gnr', "Guns N' Roses", 33, ['Guns and Roses']),
];

const key = (input: string, list: Candidate[]) => findMatch(input, list)?.candidate.key ?? null;

describe('normalize', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalize('  São Tomé & Príncipe!! ')).toBe('sao tome and principe');
    expect(normalize("Côte d'Ivoire")).toBe('cote divoire');
    expect(normalize('GUINEA-BISSAU')).toBe('guinea bissau');
    expect(normalize('Łódź')).toBe('lodz');
    expect(normalize('Straße')).toBe('strasse');
  });

  it('ignores the word "the"', () => {
    expect(normalize('The Gambia')).toBe('gambia');
    expect(normalize('Return of the King')).toBe('return of king');
    expect(normalize('The The')).toBe('the the');
  });

  it('expands St and Mt', () => {
    expect(normalize('St. Lucia')).toBe(normalize('Saint Lucia'));
    expect(normalize('Mt Kilimanjaro')).toBe(normalize('Mount Kilimanjaro'));
  });

  it('writes roman numerals, ordinals and number words as digits', () => {
    expect(normalize('Henry VIII')).toBe('henry 8');
    expect(normalize('Henry the Eighth')).toBe('henry 8');
    expect(normalize('Henry 8th')).toBe('henry 8');
    expect(normalize('Elizabeth the First')).toBe('elizabeth 1');
    expect(normalize('Toy Story Three')).toBe('toy story 3');
  });

  it('leaves the first word of an answer alone', () => {
    expect(normalize('I, Robot')).toBe('i robot');
    expect(normalize('Seven Samurai')).toBe('seven samurai');
    expect(normalize('V for Vendetta')).toBe('v for vendetta');
  });

  it('returns an empty string for input with no letters or digits', () => {
    expect(normalize('   ')).toBe('');
    expect(normalize('?!...')).toBe('');
  });
});

describe('romanToNumber', () => {
  it('reads numerals up to 39 and rejects ordinary words', () => {
    expect(romanToNumber('iv')).toBe(4);
    expect(romanToNumber('viii')).toBe(8);
    expect(romanToNumber('xiv')).toBe(14);
    expect(romanToNumber('xxxix')).toBe(39);
    expect(romanToNumber('mix')).toBeNull();
    expect(romanToNumber('iiii')).toBeNull();
    expect(romanToNumber('')).toBeNull();
  });
});

describe('editDistance', () => {
  it('counts insertions, deletions and substitutions', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('mexico', 'mexco')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
  });

  it('counts a swap of neighbouring letters as one typo', () => {
    expect(editDistance('belgium', 'beglium')).toBe(1);
    expect(editDistance('recieve', 'receive')).toBe(1);
  });
});

describe('allowedDistance', () => {
  it('scales with the length of the answer', () => {
    expect(allowedDistance(3)).toBe(0);
    expect(allowedDistance(4)).toBe(0);
    expect(allowedDistance(5)).toBe(1);
    expect(allowedDistance(8)).toBe(1);
    expect(allowedDistance(9)).toBe(2);
    expect(allowedDistance(14)).toBe(2);
    expect(allowedDistance(15)).toBe(3);
  });
});

describe('typos', () => {
  it('forgives one typo in a medium-length answer', () => {
    expect(key('Nigerea', countries)).toBe('nigeria');
    expect(key('Austrai', countries)).toBe('austria');
    expect(key('Zambai', countries)).toBe('zambia');
    expect(key('Slovakai', countries)).toBe('slovakia');
  });

  it('forgives two typos in a long answer', () => {
    expect(key('Mozambiqe', countries)).toBe('mozambique');
    expect(key('Mosambiqe', countries)).toBe('mozambique');
    expect(key('Kyrgistan', countries)).toBe('kyrgyzstan');
    expect(key('Untied Kingdm', countries)).toBe('uk');
  });

  it('forgives a dropped letter', () => {
    expect(key('Nige', countries)).toBe('niger');
    expect(key('Zamba', countries)).toBe('zambia');
  });

  it('forgives missing or extra spaces', () => {
    expect(key('NewZealand', countries)).toBe('nz');
    expect(key('new  zeeland', countries)).toBe('nz');
  });

  it('forgives accents, case and punctuation entirely', () => {
    expect(key('sao tome and principe', countries)).toBe('saotome');
    expect(key('COTE DIVOIRE', countries)).toBe('ivory');
    expect(key('st lucia', countries)).toBe('stlucia');
    expect(key('guns n roses', titles)).toBe('gnr');
    expect(key('r e m', titles)).toBe('rem');
  });

  it('reports how many typos were forgiven', () => {
    expect(findMatch('Nigeria', countries)?.distance).toBe(0);
    expect(findMatch('Nigerea', countries)?.distance).toBe(1);
  });
});

describe('aliases', () => {
  it('accepts listed aliases', () => {
    expect(key('UK', countries)).toBe('uk');
    expect(key('u.k.', countries)).toBe('uk');
    expect(key('Great Britain', countries)).toBe('uk');
    expect(key('usa', countries)).toBe('usa');
    expect(key('United States of America', countries)).toBe('usa');
    expect(key('Ivory Coast', countries)).toBe('ivory');
    expect(key('Gambia', countries)).toBe('gambia');
    expect(key('the gambia', countries)).toBe('gambia');
  });

  it('forgives typos in aliases too', () => {
    expect(key('Ivory Cost', countries)).toBe('ivory');
    expect(key('Grate Britain', countries)).toBe('uk');
  });

  it('treats "the" as optional', () => {
    expect(key('Who', titles)).toBe('who');
    expect(key('the who', titles)).toBe('who');
  });
});

describe('near misses that must fail', () => {
  it('does not confuse different short answers', () => {
    expect(key('Irak', countries)).toBeNull();
    expect(key('Male', countries)).toBeNull();
    expect(key('Malu', countries)).toBeNull();
    expect(key('UL', countries)).toBeNull();
  });

  it('keeps similar real answers apart', () => {
    expect(key('Niger', countries)).toBe('niger');
    expect(key('Nigeria', countries)).toBe('nigeria');
    expect(key('Austria', countries)).toBe('austria');
    expect(key('Australia', countries)).toBe('australia');
    expect(key('Slovenia', countries)).toBe('slovenia');
    expect(key('Iran', countries)).toBe('iran');
    expect(key('Iraq', countries)).toBe('iraq');
  });

  it('rejects a different first letter', () => {
    expect(key('Tiger', countries)).toBeNull();
    expect(key('Bambia', countries)).toBeNull();
    expect(key('Mustria', countries)).toBeNull();
  });

  it('rejects answers that are simply too far away', () => {
    expect(key('Austrolasia', countries)).toBeNull();
    expect(key('United Arab Emirates', countries)).toBeNull();
    expect(key('New Guinea', countries)).toBeNull();
    expect(key('Mexico', countries)).toBeNull();
    expect(key('Nig', countries)).toBeNull();
  });

  it('never forgives a wrong number', () => {
    expect(key('Henry VII', titles)).toBe('h7');
    expect(key('Henry VIII', titles)).toBe('h8');
    expect(key('Henry 8', titles)).toBe('h8');
    expect(key('Henry the Eighth', titles)).toBe('h8');
    expect(key('Henry IX', titles)).toBeNull();
    expect(key('Elizabeth III', titles)).toBeNull();
    expect(key('Toy Story 4', titles)).toBeNull();
    expect(key('Toy Story 2', titles)).toBe('ts2');
    expect(key('Toy Story', titles)).toBe('ts');
    expect(key('Toy Storey 3', titles)).toBe('ts3');
  });

  it('takes the higher score when a typo is equally close to two answers', () => {
    const pair = [candidate('a', 'Marlow', 5), candidate('b', 'Marlon', 60)];
    expect(key('Marloe', pair)).toBe('b');
  });

  it('prefers an exact match over a closer-looking fuzzy one', () => {
    expect(key('Slovakia', countries)).toBe('slovakia');
    expect(findMatch('Slovakia', countries)?.distance).toBe(0);
  });
});

describe('blocked near-twins', () => {
  const winners = [candidate('ie', 'Ireland', 57), candidate('se', 'Sweden', 64)];

  it('would otherwise read a different real answer as a typo', () => {
    expect(findMatch('Iceland', winners)?.candidate.key).toBe('ie');
  });

  it('never forgives a listed wrong answer as a typo', () => {
    expect(findMatch('Iceland', winners, { blocked: ['Iceland', 'Poland'] })).toBeNull();
    expect(findMatch('iceland!', winners, { blocked: ['Iceland'] })).toBeNull();
  });

  it('still forgives genuine typos and exact answers', () => {
    expect(findMatch('Irland', winners, { blocked: ['Iceland'] })?.candidate.key).toBe('ie');
    expect(findMatch('Ireland', winners, { blocked: ['Ireland'] })?.candidate.key).toBe('ie');
  });

  it('judges a blocked answer wrong', () => {
    expect(judgeAnswer('Iceland', winners, new Set(), [], { blocked: ['Iceland'] })).toEqual({
      kind: 'wrong',
      display: 'Iceland',
    });
  });
});

describe('exact mode for spelling questions', () => {
  const words = [candidate('acc', 'accommodate', 20), candidate('rhy', 'rhythm', 12)];

  it('accepts only the correct spelling', () => {
    expect(findMatch('Accommodate', words, { exact: true })?.candidate.key).toBe('acc');
    expect(findMatch('accomodate', words, { exact: true })).toBeNull();
    expect(findMatch('rythm', words, { exact: true })).toBeNull();
  });

  it('would have forgiven the same typo in normal mode', () => {
    expect(findMatch('accomodate', words)?.candidate.key).toBe('acc');
  });
});

describe('judgeAnswer', () => {
  const none = new Set<string>();

  it('scores a correct answer', () => {
    expect(judgeAnswer('niger', countries, none, [])).toEqual({
      kind: 'correct',
      key: 'niger',
      display: 'Niger',
      score: 4,
      distance: 0,
    });
  });

  it('reports blank input as empty', () => {
    expect(judgeAnswer('   ', countries, none, []).kind).toBe('empty');
    expect(judgeAnswer('...', countries, none, []).kind).toBe('empty');
  });

  it('marks an unknown answer wrong and tidies how it is shown', () => {
    expect(judgeAnswer('  Narnia   land ', countries, none, [])).toEqual({
      kind: 'wrong',
      display: 'Narnia land',
    });
  });

  it('rejects a correct answer that was already given', () => {
    const given = new Set(['uk']);
    expect(judgeAnswer('United Kingdom', countries, given, []).kind).toBe('duplicate');
  });

  it('rejects a duplicate given through an alias or with a typo', () => {
    const given = new Set(['uk', 'mozambique']);
    expect(judgeAnswer('UK', countries, given, []).kind).toBe('duplicate');
    expect(judgeAnswer('britain', countries, given, []).kind).toBe('duplicate');
    expect(judgeAnswer('Mozambiqe', countries, given, [])).toEqual({
      kind: 'duplicate',
      display: 'Mozambique',
    });
  });

  it('rejects a wrong answer that was already tried', () => {
    const wrong = ['Narnia'];
    expect(judgeAnswer('narnia', countries, none, wrong).kind).toBe('duplicate');
    expect(judgeAnswer('NARNIA!', countries, none, wrong).kind).toBe('duplicate');
    expect(judgeAnswer('Mordor', countries, none, wrong).kind).toBe('wrong');
    // Similar but not the same: judged as a fresh guess.
    expect(judgeAnswer('Narnja', countries, none, wrong).kind).toBe('wrong');
  });

  it('still accepts other answers after a duplicate', () => {
    const given = new Set(['uk']);
    expect(judgeAnswer('Zambia', countries, given, ['Narnia']).kind).toBe('correct');
  });
});

describe('sameAnswer', () => {
  it('compares two typed answers', () => {
    expect(sameAnswer('Atlantis', 'atlantis!')).toBe(true);
    expect(sameAnswer('Atlantis', 'Atlantiss')).toBe(true);
    expect(sameAnswer('Atlantis', 'Avalon')).toBe(false);
  });
});
