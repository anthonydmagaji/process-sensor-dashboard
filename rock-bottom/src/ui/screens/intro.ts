import { teamById } from '../../game/machine';
import type { AppApi } from '../app-api';
import { renderPodiums } from '../components/podiums';
import { formatPoints, h } from '../dom';
import { formatLabel, roundKicker, roundRules, roundTitle } from '../labels';
import { gameHeader } from './shared';

/** The title card before each question: round name, rules, then the question itself. */
export function renderRoundIntro(app: AppApi): HTMLElement {
  const state = app.state;
  const round = state.round;
  if (!round) throw new Error('No round to introduce');
  const names = round.teamIds.map((id) => teamById(state, id).name);
  const firstTeam = teamById(state, round.turns[0].teamId);

  const begin = h(
    'button',
    { class: 'btn btn--gold btn--large', type: 'button', 'data-autofocus': true, onclick: () => app.dispatch({ type: 'BEGIN_ROUND' }) },
    !firstTeam.isAI
      ? `${firstTeam.name} to start`
      : round.kind === 'h2h' || round.kind === 'tiebreak'
        ? 'Start the question'
        : 'Start the round',
  );

  const versus =
    round.kind === 'h2h' || round.kind === 'tiebreak'
      ? h('p', { class: 'intro__versus' }, names.flatMap((name, index) => (index === 0 ? [h('strong', null, name)] : [' v ', h('strong', null, name)])))
      : null;

  return h(
    'main',
    { class: `screen intro intro--${round.kind}` },
    gameHeader(app, roundTitle(round)),
    h(
      'div',
      { class: 'intro__card' },
      h('p', { class: 'intro__kicker' }, roundKicker(round.kind, state.h2h?.questionNumber ?? 1)),
      h('h1', { class: 'intro__title' }, roundTitle(round)),
      versus,
      h('p', { class: 'intro__rules' }, roundRules(round.kind)),
      h(
        'div',
        { class: 'intro__question' },
        h(
          'div',
          { class: 'question__tags' },
          h('span', { class: 'tag tag--gold' }, round.question.category),
          h('span', { class: 'tag' }, formatLabel(round.question.format)),
        ),
        h('p', { class: 'intro__prompt' }, round.question.prompt),
        round.question.detail ? h('p', { class: 'intro__detail' }, round.question.detail) : null,
      ),
      begin,
    ),
    renderPodiums(state),
  );
}

/** The card that sends the winning team into the final. */
export function renderFinalIntro(app: AppApi): HTMLElement {
  const state = app.state;
  const team = teamById(state, state.final?.teamId ?? 0);
  return h(
    'main',
    { class: 'screen intro intro--final' },
    gameHeader(app, 'The final'),
    h(
      'div',
      { class: 'intro__card' },
      h('p', { class: 'intro__kicker' }, 'Head-to-head winners'),
      h('h1', { class: 'intro__title' }, team.name),
      h(
        'div',
        { class: 'jackpot-banner jackpot-banner--inline' },
        h('span', { class: 'jackpot-banner__label' }, 'Playing for'),
        h('span', { class: 'jackpot-banner__value' }, formatPoints(state.jackpot)),
        h('span', { class: 'jackpot-banner__unit' }, 'points'),
      ),
      h(
        'p',
        { class: 'intro__rules' },
        'Choose one of three categories, then give three answers. If any one of them is a rock-bottom answer, one that none of our hundred people gave, the jackpot is yours.',
      ),
      h(
        'button',
        { class: 'btn btn--gold btn--large', type: 'button', 'data-autofocus': true, onclick: () => app.dispatch({ type: 'NEXT' }) },
        'See the categories',
      ),
    ),
  );
}
