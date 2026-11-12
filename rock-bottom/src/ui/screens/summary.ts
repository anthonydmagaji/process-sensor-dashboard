import { H2H_WINS_NEEDED, teamById } from '../../game/machine';
import { entriesOf } from '../../game/questions';
import type { GameState, GivenAnswer, RoundSummary } from '../../game/types';
import type { AppApi } from '../app-api';
import { h } from '../dom';
import { roundTitle } from '../labels';
import { gameHeader } from './shared';

function answerCell(answer: GivenAnswer): HTMLElement {
  const kind = !answer.correct ? 'wrong' : answer.score === 0 ? 'zero' : 'ok';
  return h(
    'span',
    { class: `result__answer result__answer--${kind}` },
    h('span', { class: 'result__text' }, answer.display),
    h('span', { class: `badge badge--${kind}` }, answer.score),
  );
}

/** What the summary means in words: who is out, who won the question, or that it is a tie. */
function headline(state: GameState, summary: RoundSummary): { title: string; detail: string } {
  const name = (id: number) => teamById(state, id).name;

  if (summary.kind === 'h2h' && state.h2h) {
    const [a, b] = state.h2h.teamIds;
    const score = `${name(a)} ${state.h2h.wins[a]} – ${state.h2h.wins[b]} ${name(b)}`;
    if (summary.matchWinnerId !== null) {
      return { title: `${name(summary.matchWinnerId)} win the head to head`, detail: `${score}. They go through to the final.` };
    }
    if (summary.pointWinnerId !== null) {
      return { title: `${name(summary.pointWinnerId)} take the question`, detail: `${score}. First to ${H2H_WINS_NEEDED} wins.` };
    }
    return { title: 'Dead level', detail: `Nobody takes that one, so we play another. ${score}.` };
  }

  if (summary.tiedIds.length > 1) {
    const names = summary.tiedIds.map(name);
    const list = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return {
      title: 'It is a tie',
      detail: `${list} are level on ${summary.totals[summary.tiedIds[0]]}. A sudden-death tiebreak will decide who leaves.`,
    };
  }
  const out = summary.eliminatedId as number;
  return {
    title: `${name(out)} are out`,
    detail: `The highest score of the round, ${summary.totals[out]}, sends them home.`,
  };
}

function nextLabel(summary: RoundSummary): string {
  if (summary.kind === 'h2h') return summary.matchWinnerId !== null ? 'On to the final' : 'Next question';
  if (summary.tiedIds.length > 1) return 'Play the tiebreak';
  return summary.number === 1 ? 'On to round 2' : 'On to the head to head';
}

/** The best answers nobody found, and the one most people gave. */
function missedAnswers(summary: RoundSummary): HTMLElement | null {
  const found = new Set(summary.given.flatMap((answer) => (answer.key ? [answer.key] : [])));
  const entries = entriesOf(summary.question);
  const unfound = entries.filter((entry) => !found.has(entry.key)).sort((a, b) => a.score - b.score);
  if (unfound.length === 0) return null;

  const best = unfound.slice(0, 4);
  const popular = entries.slice().sort((a, b) => b.score - a.score)[0];
  const item = (text: string, score: number) =>
    h(
      'li',
      { class: 'chip' },
      h('span', { class: 'chip__text' }, text),
      h('span', { class: `badge badge--${score === 0 ? 'zero' : 'ok'}` }, score),
    );

  return h(
    'section',
    { class: 'panel missed' },
    h('h3', { class: 'panel__title' }, 'Low scorers nobody found'),
    h('ul', { class: 'chips' }, best.map((entry) => item(entry.display, entry.score))),
    h('p', { class: 'missed__popular' }, 'Most popular answer: ', h('strong', null, popular.display), ` (${popular.score})`),
  );
}

/** Result of a round, tiebreak or head-to-head question. */
export function renderSummary(app: AppApi): HTMLElement {
  const state = app.state;
  const summary = state.summary;
  if (!summary) throw new Error('No summary to show');
  const { title, detail } = headline(state, summary);
  const ids = Object.keys(summary.totals)
    .map(Number)
    .sort((a, b) => summary.totals[a] - summary.totals[b]);

  const rows = ids.map((id, index) => {
    const team = teamById(state, id);
    const answers = summary.given.filter((answer) => answer.teamId === id);
    const flag =
      summary.eliminatedId === id
        ? 'Eliminated'
        : summary.tiedIds.includes(id)
          ? 'Tied'
          : summary.pointWinnerId === id
            ? 'Wins the question'
            : null;
    return h(
      'li',
      {
        class: [
          'result',
          summary.eliminatedId === id ? 'result--out' : '',
          summary.tiedIds.includes(id) ? 'result--tied' : '',
          summary.pointWinnerId === id ? 'result--win' : '',
        ]
          .filter(Boolean)
          .join(' '),
        style: `--order:${index}`,
      },
      h(
        'div',
        { class: 'result__team' },
        h('span', { class: 'result__name' }, team.name),
        flag ? h('span', { class: 'result__flag' }, flag) : null,
      ),
      h('div', { class: 'result__answers' }, answers.map(answerCell)),
      h('div', { class: 'result__total', 'aria-label': `Total ${summary.totals[id]}` }, summary.totals[id]),
    );
  });

  return h(
    'main',
    { class: 'screen summary' },
    gameHeader(app, `${roundTitle(summary)} result`),
    h(
      'div',
      { class: 'summary__body' },
      h(
        'div',
        { class: 'summary__headline' },
        h('p', { class: 'intro__kicker' }, summary.question.prompt),
        h('h1', { class: 'summary__title' }, title),
        h('p', { class: 'summary__detail' }, detail),
      ),
      h('ol', { class: 'results', 'aria-label': 'Scores, lowest first' }, rows),
      missedAnswers(summary),
      h(
        'button',
        { class: 'btn btn--gold btn--large', type: 'button', 'data-autofocus': true, onclick: () => app.dispatch({ type: 'NEXT' }) },
        nextLabel(summary),
      ),
    ),
  );
}
