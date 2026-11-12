import { shuffle } from './random';
import type { Rng } from './types';

export type Band = 'zero' | 'brilliant' | 'great' | 'good' | 'middling' | 'high' | 'huge' | 'wrong' | 'timeout';

/** Host lines. {answer}, {team} and {score} are filled in when a line is used. */
const LINES: Record<Band, string[]> = {
  zero: [
    'Rock bottom! Not one of our hundred said {answer}. That is as good as it gets.',
    'Nobody. Not a soul. {answer} goes all the way to the floor.',
    'All the way down! {team}, that is a trophy answer.',
    'A hundred people, zero takers. {answer} is the perfect answer.',
    'You could hear a pin drop, and then the column did. Nothing at all for {answer}.',
    'That is the one we dream about. {answer}: absolutely nobody.',
    'Straight through the floor. {team}, take a bow.',
  ],
  brilliant: [
    'Just {score}! {answer} was hiding in plain sight and almost nobody found it.',
    'So close to the floor. Only {score} of our hundred went for {answer}.',
    'That is a superb answer. {score} for {answer}.',
    'Deep, deep knowledge from {team}. {answer} scores {score}.',
    'Tiny! {score} points, and {team} will be delighted with that.',
    'You do not get many better than that. {answer}, just {score}.',
    'Nearly the full drop. {score} people beat you to {answer}, and that is all.',
  ],
  great: [
    'A very tidy answer. {answer} comes in at {score}.',
    'Lovely stuff. Only {score} people thought of {answer}.',
    '{team} know their stuff. {score} for {answer}.',
    'That will do very nicely indeed. {score}.',
    'Well down the column. {answer} was a smart pick at {score}.',
    'A low one! {score} points, and the pressure moves along.',
    'Plenty of daylight above that. {answer}: {score}.',
  ],
  good: [
    'A good, solid answer. {answer} scores {score}.',
    'Nothing wrong with that. {score} for {answer}.',
    'Comfortably in the bottom half. {score}.',
    '{answer} keeps {team} in decent shape with {score}.',
    'Respectable. {score} of our hundred said {answer}.',
    'That is a sensible score. {score} on the board for {team}.',
    'Not spectacular, not scary. {score}.',
  ],
  middling: [
    'Right in the middle of the pack. {answer} scores {score}.',
    'A fair few people thought of {answer}: {score} of them.',
    'Safe rather than sneaky. {score} for {team}.',
    '{score}. It is right, but it will not win any prizes for obscurity.',
    'The column got tired halfway down. {answer}: {score}.',
    'Correct, and that is the main thing. {score}.',
    'Middling. {score} people got there before you with {answer}.',
  ],
  high: [
    'Ooh, that is a popular one. {answer} scores {score}.',
    'It barely moved! {score} of our hundred said {answer}.',
    'Correct, but everybody knows {answer}. {score}.',
    'That is the answer the whole room was thinking. {score}.',
    'Right answer, big number. {score} for {team}.',
    'A crowd-pleaser, which is exactly the problem. {score}.',
    '{answer} was the obvious one, and it shows: {score}.',
  ],
  huge: [
    'Practically everyone said {answer}. {score}!',
    'The column hardly bothered. {score} for {answer}.',
    'That might be the most popular answer on the board: {score}.',
    'Right, but at what cost? {score} for {team}.',
    '{score}. It is correct. That is the nicest thing I can say about it.',
    'Almost a full house for {answer}: {score} out of a hundred.',
  ],
  wrong: [
    'Oh dear. {answer} is not on our list, so that is the full 100.',
    'No, I am afraid not. {answer} is wrong, and that costs {team} 100 points.',
    'The column is not going anywhere. {answer} is incorrect.',
    'That is the maximum, {team}. {answer} is not an answer we can accept.',
    'A hundred. {answer} sounded plausible, but it is not right.',
    'Sorry, {team}. {answer} is a wrong answer and wrong answers score 100.',
    'Not this time. 100 points, and a nervous wait for {team}.',
  ],
  timeout: [
    'Time is up, and no answer means the full 100 for {team}.',
    'The clock beat you there, {team}. That is 100 points.',
    'Out of time! Nothing given, so the maximum 100.',
    'Twenty seconds can vanish quickly. 100 for {team}.',
  ],
};

export function bandFor(score: number, correct: boolean, timedOut: boolean): Band {
  if (timedOut) return 'timeout';
  if (!correct) return 'wrong';
  if (score === 0) return 'zero';
  if (score <= 5) return 'brilliant';
  if (score <= 15) return 'great';
  if (score <= 30) return 'good';
  if (score <= 55) return 'middling';
  if (score <= 85) return 'high';
  return 'huge';
}

export interface CommentaryInput {
  answer: string;
  team: string;
  score: number;
  correct: boolean;
  timedOut: boolean;
}

/**
 * Hands out host lines without repeating itself: each band's lines are dealt
 * like a shuffled deck, and the deck is only reshuffled once it runs out.
 */
export class Commentator {
  private decks = new Map<Band, string[]>();
  private lastLine = new Map<Band, string>();

  constructor(private readonly rng: Rng) {}

  line(input: CommentaryInput): string {
    const band = bandFor(input.score, input.correct, input.timedOut);
    let deck = this.decks.get(band);
    if (!deck || deck.length === 0) {
      deck = shuffle(this.rng, LINES[band]);
      // Never open a new deck with the line that closed the last one.
      if (deck.length > 1 && deck[deck.length - 1] === this.lastLine.get(band)) {
        [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
      }
      this.decks.set(band, deck);
    }
    const template = deck.pop() as string;
    this.lastLine.set(band, template);
    return template
      .replaceAll('{answer}', input.answer)
      .replaceAll('{team}', input.team)
      .replaceAll('{score}', String(input.score));
  }
}

export function allLines(): Record<Band, string[]> {
  return LINES;
}
