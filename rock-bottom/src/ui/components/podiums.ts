import { H2H_WINS_NEEDED, roundTotals } from '../../game/machine';
import type { GameState, GivenAnswer, Team } from '../../game/types';
import { h, svg } from '../dom';
import { ICON_ROBOT, ICON_TROPHY } from '../icons';

function trophyBadge(team: Team): HTMLElement | null {
  if (team.trophies === 0) return null;
  return h(
    'span',
    {
      class: 'podium__trophies',
      title: `${team.trophies} rock-bottom ${team.trophies === 1 ? 'trophy' : 'trophies'}`,
      'aria-label': `${team.trophies} ${team.trophies === 1 ? 'trophy' : 'trophies'}`,
    },
    svg(ICON_TROPHY),
    team.trophies > 1 ? `×${team.trophies}` : null,
  );
}

function scoreSlot(answer: GivenAnswer | undefined): HTMLElement {
  if (!answer) return h('span', { class: 'podium__slot podium__slot--empty' }, '–');
  const kind = !answer.correct ? 'wrong' : answer.score === 0 ? 'zero' : 'ok';
  return h('span', { class: `podium__slot podium__slot--${kind}`, title: answer.display }, answer.score);
}

/**
 * The scoreboard: one podium per team with this round's scores, trophies and
 * who is still in. `hideLatest` holds back the newest answer while its reveal plays.
 */
export function renderPodiums(state: GameState, options: { hideLatest?: boolean } = {}): HTMLElement {
  const round = state.round;
  const turn = round && state.phase === 'awaitAnswer' ? round.turns[round.turnIndex] : null;
  const given = round ? (options.hideLatest ? round.given.slice(0, -1) : round.given) : [];
  const totals = round ? roundTotals({ ...round, given }) : {};
  const slotsPerTeam = round ? round.turns.filter((t) => t.teamId === round.teamIds[0]).length : 0;

  const podiums = state.teams.map((team) => {
    const playing = round ? round.teamIds.includes(team.id) : state.activeIds.includes(team.id);
    const out = team.eliminatedIn !== null;
    const isTurn = turn?.teamId === team.id;
    const answers = given.filter((answer) => answer.teamId === team.id);

    let body: HTMLElement;
    if (out) {
      body = h('div', { class: 'podium__status' }, 'Out');
    } else if (!playing) {
      body = h('div', { class: 'podium__status podium__status--safe' }, 'Safe');
    } else if (round) {
      const slots = Array.from({ length: slotsPerTeam }, (_, index) => scoreSlot(answers[index]));
      body = h(
        'div',
        { class: 'podium__scores' },
        h('div', { class: 'podium__slots' }, slots),
        slotsPerTeam > 1
          ? h(
              'div',
              { class: 'podium__total', 'aria-label': answers.length > 0 ? `Total ${totals[team.id]}` : 'No score yet' },
              answers.length > 0 ? totals[team.id] : '',
            )
          : null,
      );
    } else {
      body = h('div', { class: 'podium__status podium__status--safe' }, team.id === state.championId ? 'Finalists' : '');
    }

    const wins =
      state.h2h && round?.kind === 'h2h' && state.h2h.teamIds.includes(team.id)
        ? h(
            'div',
            { class: 'podium__wins', 'aria-label': `${state.h2h.wins[team.id]} questions won` },
            Array.from({ length: H2H_WINS_NEEDED }, (_, index) =>
              h('span', { class: `pip${index < (state.h2h?.wins[team.id] ?? 0) ? ' pip--on' : ''}` }),
            ),
          )
        : null;

    return h(
      'li',
      {
        class: [
          'podium',
          isTurn ? 'podium--turn' : '',
          out ? 'podium--out' : '',
          !out && !playing ? 'podium--safe' : '',
        ]
          .filter(Boolean)
          .join(' '),
        'data-team': team.id,
        'aria-current': isTurn ? 'true' : null,
      },
      h(
        'div',
        { class: 'podium__head' },
        team.isAI ? h('span', { class: 'podium__ai', title: 'Computer team' }, svg(ICON_ROBOT)) : null,
        h('span', { class: 'podium__name' }, team.name),
        trophyBadge(team),
      ),
      wins,
      body,
    );
  });

  return h('ul', { class: 'podiums', 'aria-label': 'Scoreboard' }, podiums);
}
