import { FINAL_ANSWERS, teamById } from '../../game/machine';
import type { FinalAnswer } from '../../game/types';
import type { AppApi } from '../app-api';
import { formatPoints, h } from '../dom';
import { formatLabel } from '../labels';
import { renderAnswerPanel, type AnswerView } from './play';
import { gameHeader } from './shared';

/** Three category cards; the finalists pick one before seeing its question. */
export function renderFinalChoose(app: AppApi): HTMLElement {
  const state = app.state;
  const final = state.final;
  if (!final) throw new Error('No final to play');
  const team = teamById(state, final.teamId);

  const cards = final.options.map((question, index) =>
    h(
      'button',
      {
        class: 'category',
        type: 'button',
        disabled: team.isAI,
        'data-question': question.id,
        'data-autofocus': index === 0 && !team.isAI,
        style: `--order:${index}`,
        onclick: () => app.dispatch({ type: 'CHOOSE_CATEGORY', questionId: question.id }),
      },
      h('span', { class: 'category__number' }, index + 1),
      h('span', { class: 'category__name' }, question.category),
      h('span', { class: 'category__format' }, formatLabel(question.format)),
    ),
  );

  return h(
    'main',
    { class: 'screen final-choose' },
    gameHeader(app, 'The final'),
    h(
      'div',
      { class: 'final__body' },
      h('p', { class: 'intro__kicker' }, `Playing for ${formatPoints(state.jackpot)} points`),
      h('h1', { class: 'summary__title' }, team.isAI ? `${team.name} are choosing` : `${team.name}, choose your category`),
      h('p', { class: 'summary__detail' }, 'You will see the question once you have chosen.'),
      h('div', { class: 'categories' }, cards),
    ),
  );
}

function slot(answer: FinalAnswer | undefined, index: number, revealed: boolean, active: boolean): HTMLElement {
  const kind = !answer ? 'empty' : !revealed ? 'hidden' : !answer.correct ? 'wrong' : answer.score === 0 ? 'zero' : 'ok';
  return h(
    'li',
    { class: `final-slot final-slot--${kind}${active ? ' final-slot--active' : ''}` },
    h('span', { class: 'final-slot__number' }, index + 1),
    h('span', { class: 'final-slot__text' }, answer ? answer.display : active ? 'Your answer…' : ''),
    answer && revealed ? h('span', { class: `badge badge--${kind}` }, answer.score) : null,
  );
}

function finalSlots(answers: FinalAnswer[], revealed: number, collecting: boolean): HTMLElement {
  return h(
    'ol',
    { class: 'final-slots', 'aria-label': 'Final answers' },
    Array.from({ length: FINAL_ANSWERS }, (_, index) =>
      slot(answers[index], index, index < revealed, collecting && index === answers.length),
    ),
  );
}

function finalQuestion(app: AppApi): HTMLElement {
  const question = app.state.final?.question;
  if (!question) throw new Error('No final question');
  return h(
    'section',
    { class: 'question question--final' },
    h(
      'div',
      { class: 'question__head' },
      h('div', { class: 'question__tags' }, h('span', { class: 'tag tag--gold' }, question.category), h('span', { class: 'tag' }, 'Jackpot question')),
      h('h2', { class: 'question__prompt' }, question.prompt),
      question.detail ? h('p', { class: 'question__detail' }, question.detail) : null,
    ),
  );
}

/** The finalists type their three answers. */
export function renderFinalAnswer(app: AppApi): AnswerView {
  const state = app.state;
  const final = state.final;
  if (!final) throw new Error('No final to play');
  const team = teamById(state, final.teamId);
  const number = final.answers.length + 1;

  const answer = renderAnswerPanel({
    turnLine: [
      h('strong', null, team.name),
      h('span', { class: 'answer__player' }, `Answer ${number} of ${FINAL_ANSWERS}`),
      ...(team.isAI ? [h('span', { class: 'answer__thinking' }, 'are thinking', h('span', { class: 'dots' }, h('i'), h('i'), h('i')))] : []),
    ],
    isAI: team.isAI,
    placeholder: team.isAI ? '' : 'Type an answer nobody else would give',
    onSubmit: (text) => app.dispatch({ type: 'FINAL_SUBMIT', text }),
  });

  const element = h(
    'main',
    { class: 'screen final-answer' },
    gameHeader(app, 'The final'),
    h(
      'div',
      { class: 'play__grid' },
      finalQuestion(app),
      h(
        'div',
        { class: 'play__side' },
        answer.panel,
        finalSlots(final.answers, 0, true),
        h('p', { class: 'final__reminder' }, `One rock-bottom answer wins ${formatPoints(state.jackpot)} points.`),
      ),
    ),
  );
  return { element, input: answer.input, clock: answer.clock, setHint: answer.setHint, lock: answer.lock };
}

/** Backdrop while the three final answers are revealed one by one. */
export function renderFinalReveal(app: AppApi): HTMLElement {
  const state = app.state;
  const final = state.final;
  if (!final) throw new Error('No final to play');
  return h(
    'main',
    { class: 'screen final-reveal' },
    gameHeader(app, 'The final'),
    h(
      'div',
      { class: 'final__body' },
      finalQuestion(app),
      finalSlots(final.answers, final.revealed, false),
      h('p', { class: 'final__reminder' }, `One rock-bottom answer wins ${formatPoints(state.jackpot)} points.`),
    ),
  );
}
