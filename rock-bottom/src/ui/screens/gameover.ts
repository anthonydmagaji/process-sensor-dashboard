import { JACKPOT_STEP, nextJackpot, teamById } from '../../game/machine';
import { entriesOf } from '../../game/questions';
import type { GameState, Team } from '../../game/types';
import type { AppApi } from '../app-api';
import { formatPoints, h, svg } from '../dom';
import { ICON_ROBOT, ICON_TROPHY } from '../icons';
import { gameHeader } from './shared';

const PLACE: Record<string, { rank: number; label: string }> = {
  h2h: { rank: 2, label: 'Runners-up' },
  elim2: { rank: 3, label: 'Out in round 2' },
  elim1: { rank: 4, label: 'Out in round 1' },
};

function standings(state: GameState): HTMLElement {
  const ranked = state.teams
    .map((team) => ({
      team,
      rank: team.eliminatedIn ? PLACE[team.eliminatedIn].rank : 1,
      label: team.eliminatedIn ? PLACE[team.eliminatedIn].label : state.final?.won ? 'Jackpot winners' : 'Finalists',
    }))
    .sort((a, b) => a.rank - b.rank);

  const trophies = (team: Team) =>
    h(
      'span',
      { class: `standing__trophies${team.trophies === 0 ? ' standing__trophies--none' : ''}`, 'aria-label': `${team.trophies} trophies` },
      svg(ICON_TROPHY),
      team.trophies,
    );

  return h(
    'section',
    { class: 'panel' },
    h('h3', { class: 'panel__title' }, 'Final scoreboard'),
    h(
      'ol',
      { class: 'standings' },
      ranked.map(({ team, rank, label }) =>
        h(
          'li',
          { class: `standing${rank === 1 ? ' standing--first' : ''}` },
          h('span', { class: 'standing__rank' }, rank),
          h(
            'span',
            { class: 'standing__team' },
            h('span', { class: 'standing__name' }, team.isAI ? svg(ICON_ROBOT) : null, team.name),
            h('span', { class: 'standing__label' }, label),
          ),
          trophies(team),
        ),
      ),
    ),
    h('p', { class: 'field__note' }, 'One trophy for every rock-bottom answer.'),
  );
}

/** The end of the show: jackpot result, the answers that would have won, and the scoreboard. */
export function renderGameOver(app: AppApi): HTMLElement {
  const state = app.state;
  const final = state.final;
  if (!final?.question) throw new Error('No final result');
  const team = teamById(state, final.teamId);
  const won = final.won;

  const answers = final.answers.map((answer, index) => {
    const shown = index < final.revealed;
    const kind = !answer.correct ? 'wrong' : answer.score === 0 ? 'zero' : 'ok';
    return h(
      'li',
      { class: `final-slot final-slot--${shown ? kind : 'hidden'}` },
      h('span', { class: 'final-slot__number' }, index + 1),
      h('span', { class: 'final-slot__text' }, answer.display),
      // Answers never revealed (the jackpot was already won) show their score here.
      h('span', { class: `badge badge--${kind}` }, answer.score),
    );
  });

  const given = new Set(final.answers.flatMap((answer) => (answer.key ? [answer.key] : [])));
  const zeros = entriesOf(final.question).filter((entry) => entry.score === 0 && !given.has(entry.key));

  const hero = won
    ? h(
        'div',
        { class: 'gameover__hero gameover__hero--won' },
        h('p', { class: 'intro__kicker' }, 'Jackpot won'),
        h('h1', { class: 'gameover__title' }, `${team.name} win ${formatPoints(state.jackpot)} points!`),
        h('p', { class: 'summary__detail' }, `A rock-bottom answer in the final. The jackpot resets to ${formatPoints(nextJackpot(state))} for the next game.`),
      )
    : h(
        'div',
        { class: 'gameover__hero' },
        h('p', { class: 'intro__kicker' }, 'So close'),
        h('h1', { class: 'gameover__title' }, `No jackpot for ${team.name} this time`),
        h(
          'p',
          { class: 'summary__detail' },
          `None of the three answers hit rock bottom, so the jackpot rolls over: ${formatPoints(state.jackpot)} + ${JACKPOT_STEP} = `,
          h('strong', null, `${formatPoints(nextJackpot(state))} points`),
          ' next game.',
        ),
      );

  return h(
    'main',
    { class: `screen gameover${won ? ' gameover--won' : ''}` },
    gameHeader(app, 'Result'),
    h(
      'div',
      { class: 'gameover__body' },
      hero,
      h(
        'section',
        { class: 'panel' },
        h('h3', { class: 'panel__title' }, final.question.prompt),
        h('ol', { class: 'final-slots' }, answers),
        zeros.length > 0
          ? h(
              'div',
              { class: 'missed' },
              h('p', { class: 'question__sofar' }, won ? 'Other rock-bottom answers' : 'The rock-bottom answers were'),
              h(
                'ul',
                { class: 'chips' },
                zeros.map((entry) =>
                  h('li', { class: 'chip chip--zero' }, h('span', { class: 'chip__text' }, entry.display), h('span', { class: 'badge badge--zero' }, 0)),
                ),
              ),
            )
          : null,
      ),
      standings(state),
      h(
        'button',
        { class: 'btn btn--gold btn--large', type: 'button', 'data-autofocus': true, onclick: () => app.playAgain() },
        'Play again',
      ),
    ),
  );
}
