/**
 * Text normalisation for answer checking.
 *
 * normalize() reduces a typed answer to a canonical form so that case,
 * accents, punctuation, the word "the" and different ways of writing numbers
 * never decide whether an answer is right.
 */

/** Letters that Unicode decomposition does not reduce to plain ASCII. */
const SPECIAL_LETTERS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ł: 'l',
  ı: 'i',
};

/** Whole-word expansions applied after punctuation is removed. */
const WORD_EXPANSIONS: Record<string, string> = {
  st: 'saint',
  mt: 'mount',
};

const NUMBER_WORDS: Record<string, string> = {
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
};

/** "first" only counts as a number after a name ("Elizabeth the First"). */
const TRAILING_ONLY_NUMBER_WORDS: Record<string, string> = {
  first: '1',
};

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10 };
const ROMAN_PATTERN = /^x{0,3}(ix|iv|v?i{0,3})$/;

/** Converts a roman numeral from I to XXXIX; returns null for anything else. */
export function romanToNumber(token: string): number | null {
  if (!token || !ROMAN_PATTERN.test(token)) return null;
  let total = 0;
  for (let i = 0; i < token.length; i++) {
    const value = ROMAN_VALUES[token[i]];
    const next = ROMAN_VALUES[token[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total > 0 ? total : null;
}

function stripAccents(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x300 && code <= 0x36f) continue; // combining marks
    out += SPECIAL_LETTERS[ch] ?? ch;
  }
  return out;
}

/**
 * Canonical form of an answer: lower case, no accents or punctuation, no
 * "the", numbers written as digits. Words are separated by single spaces.
 */
export function normalize(raw: string): string {
  let text = stripAccents(raw.toLowerCase());
  text = text.replace(/&/g, ' and ');
  text = text.replace(/['’‘`´]/g, ''); // apostrophes join: O'Brien -> obrien
  text = text.replace(/(\d)(st|nd|rd|th)\b/g, '$1'); // 8th -> 8
  text = text.replace(/[^a-z0-9]+/g, ' ').trim();
  if (!text) return '';

  const words = text.split(' ');
  const out: string[] = [];
  words.forEach((word, index) => {
    if (word === 'the') return;
    const expanded = WORD_EXPANSIONS[word];
    if (expanded) {
      out.push(expanded);
      return;
    }
    // Numbers are only rewritten after the first word, so titles such as
    // "I, Robot" or "Seven Samurai" keep their opening word.
    if (index > 0) {
      const roman = romanToNumber(word);
      if (roman !== null) {
        out.push(String(roman));
        return;
      }
      const numberWord = NUMBER_WORDS[word] ?? TRAILING_ONLY_NUMBER_WORDS[word];
      if (numberWord && out.length > 0) {
        out.push(numberWord);
        return;
      }
    }
    out.push(word);
  });

  // An answer made only of "the" (the band The The) must not vanish.
  if (out.length === 0) return words.join(' ');
  return out.join(' ');
}

/** Normalised form with the spaces removed ("new zealand" -> "newzealand"). */
export function compact(normalized: string): string {
  return normalized.replace(/ /g, '');
}

/** The digit groups in a normalised answer, sorted, e.g. "toy story 2" -> ["2"]. */
export function numberTokens(normalized: string): string[] {
  return (normalized.match(/\d+/g) ?? []).slice().sort();
}
