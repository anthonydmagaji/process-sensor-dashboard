import { entriesOf, type Entry } from '../../game/questions';
import type { GivenAnswer, Question, Team } from '../../game/types';
import { h } from '../dom';
import { formatLabel } from '../labels';

function scoreBadge(answer: GivenAnswer): HTMLElement {
  const kind = !answer.correct ? 'wrong' : answer.score === 0 ? 'zero' : 'ok';
  return h('span', { class: `badge badge--${kind}` }, answer.correct ? answer.score : '✗');
}

/** Clue text with its ____ blank drawn as a gap, or filled in once answered. */
function clueText(text: string, filled: string | null): (HTMLElement | string)[] {
  const parts = text.split(/_{3,}/);
  const nodes: (HTMLElement | string)[] = [];
  parts.forEach((part, index) => {
    if (part) nodes.push(part);
    if (index < parts.length - 1) {
      nodes.push(
        filled
          ? h('span', { class: 'blank blank--filled' }, filled)
          : h('span', { class: 'blank', role: 'img', 'aria-label': 'blank' }),
      );
    }
  });
  return nodes;
}

function clueRow(question: Question, entry: Entry, number: number, answer: GivenAnswer | undefined): HTMLElement {
  let content: HTMLElement;
  if (entry.hints) {
    content = h(
      'div',
      { class: 'clue__hints' },
      entry.hints.map((hint) => h('span', { class: 'clue__hint' }, hint)),
    );
  } else if (question.format === 'blank') {
    content = h('div', { class: 'clue__text' }, clueText(entry.clue ?? '', answer ? entry.display : null));
  } else {
    content = h('div', { class: 'clue__text' }, entry.clue ?? '');
  }

  return h(
    'li',
    { class: `clue${answer ? ' clue--answered' : ''}` },
    h('span', { class: 'clue__number' }, number),
    h(
      'div',
      { class: 'clue__body' },
      content,
      answer && question.format !== 'blank' ? h('div', { class: 'clue__answer' }, entry.display) : null,
    ),
    answer ? scoreBadge(answer) : null,
  );
}

export interface QuestionViewOptions {
  question: Question;
  /** Keys of the clues on show; null for an open list. */
  board: string[] | null;
  given: GivenAnswer[];
  teams: Team[];
  /** Hide the newest answer's score while its reveal is playing. */
  hideLatest?: boolean;
}

/** The question panel: prompt, then either the clue board or the answers so far. */
export function renderQuestion(options: QuestionViewOptions): HTMLElement {
  const { question, board } = options;
  const given = options.hideLatest ? options.given.slice(0, -1) : options.given;

  const head = h(
    'div',
    { class: 'question__head' },
    h(
      'div',
      { class: 'question__tags' },
      h('span', { class: 'tag tag--gold' }, question.category),
      h('span', { class: 'tag' }, formatLabel(question.format)),
    ),
    h('h2', { class: 'question__prompt' }, question.prompt),
    question.detail ? h('p', { class: 'question__detail' }, question.detail) : null,
  );

  let body: HTMLElement;
  if (board) {
    const entries = entriesOf(question);
    const rows = board.map((key, index) => {
      const entry = entries.find((candidate) => candidate.key === key) as Entry;
      return clueRow(
        question,
        entry,
        index + 1,
        given.find((answer) => answer.key === key),
      );
    });
    const misses = given.filter((answer) => !answer.correct && !answer.timedOut);
    body = h(
      'div',
      { class: 'question__body' },
      h('ol', { class: `clues clues--${question.format}`, 'aria-label': 'Clues' }, rows),
      misses.length > 0
        ? h(
            'p',
            { class: 'question__misses' },
            'Wrong so far: ',
            misses.map((answer, index) => [index > 0 ? ', ' : '', h('s', null, answer.display)]).flat(),
          )
        : null,
    );
  } else {
    const chips = given
      .filter((answer) => !answer.timedOut)
      .map((answer) =>
        h(
          'li',
          { class: `chip${answer.correct ? '' : ' chip--wrong'}${answer.correct && answer.score === 0 ? ' chip--zero' : ''}` },
          h('span', { class: 'chip__text' }, answer.display),
          scoreBadge(answer),
        ),
      );
    body = h(
      'div',
      { class: 'question__body' },
      chips.length > 0
        ? h('div', null, h('p', { class: 'question__sofar' }, 'Already given this round'), h('ul', { class: 'chips' }, chips))
        : h('p', { class: 'question__sofar question__sofar--none' }, 'No answers yet. The whole list is up for grabs.'),
    );
  }

  return h('section', { class: 'question', 'aria-label': 'Question' }, head, body);
}
