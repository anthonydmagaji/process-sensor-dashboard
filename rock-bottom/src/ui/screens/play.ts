import { currentTurn, teamById } from '../../game/machine';
import type { AppApi } from '../app-api';
import { Clock } from '../components/clock';
import { renderPodiums } from '../components/podiums';
import { renderQuestion } from '../components/questionView';
import { h } from '../dom';
import { playerLabel, roundTitle } from '../labels';
import { gameHeader } from './shared';

/** Handles the controller keeps on the live answer screen. */
export interface AnswerView {
  element: HTMLElement;
  input: HTMLInputElement;
  clock: Clock;
  /** Shows a message under the answer box; `problem` also shakes the box. */
  setHint(text: string, problem?: boolean): void;
  /** Locks the form once an answer is in. */
  lock(): void;
}

export interface AnswerPanelOptions {
  /** Line above the box, e.g. the team and player whose turn it is. */
  turnLine: (HTMLElement | string)[];
  isAI: boolean;
  placeholder: string;
  onSubmit: (text: string) => void;
}

/** The answer box, lock-in button, clock and hint line, shared with the final. */
export function renderAnswerPanel(options: AnswerPanelOptions): Omit<AnswerView, 'element'> & { panel: HTMLElement } {
  const clock = new Clock();
  const hint = h('p', { class: 'answer__hint', 'aria-live': 'polite' });
  const input = h('input', {
    class: 'input input--answer',
    type: 'text',
    name: 'answer',
    placeholder: options.placeholder,
    'aria-label': 'Your answer',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'words',
    spellcheck: 'false',
    enterkeyhint: 'send',
    maxlength: 80,
    readonly: options.isAI,
  });
  // Once the player starts correcting a rejected answer, the complaint goes away.
  input.addEventListener('input', () => {
    if (hint.classList.contains('answer__hint--problem')) {
      hint.textContent = '';
      hint.classList.remove('answer__hint--problem');
    }
  });
  const button = h('button', { class: 'btn btn--gold', type: 'submit', disabled: options.isAI }, 'Lock in');
  const form = h(
    'form',
    {
      class: 'answer__form',
      onsubmit: (event) => {
        event.preventDefault();
        if (!options.isAI && !input.disabled) options.onSubmit(input.value);
      },
    },
    input,
    button,
  );

  const panel = h(
    'section',
    { class: `answer${options.isAI ? ' answer--ai' : ''}`, 'aria-label': 'Answer' },
    h('p', { class: 'answer__turn' }, options.turnLine),
    form,
    clock.element,
    hint,
  );

  return {
    panel,
    input,
    clock,
    setHint(text, problem = false) {
      hint.textContent = text;
      hint.classList.toggle('answer__hint--problem', problem);
      if (problem) {
        form.classList.remove('shake');
        void form.offsetWidth; // restart the animation
        form.classList.add('shake');
      }
    },
    lock() {
      input.disabled = true;
      button.disabled = true;
      clock.stop();
    },
  };
}

/** The main game screen: question, answer box and scoreboard. */
export function renderPlay(app: AppApi): AnswerView {
  const state = app.state;
  const round = state.round;
  const turn = currentTurn(state);
  if (!round || !turn) throw new Error('No turn to play');
  const team = teamById(state, turn.teamId);
  const passes = Math.max(...round.turns.map((t) => t.pass));

  const answer = renderAnswerPanel({
    turnLine: [
      h('strong', null, team.name),
      h('span', { class: 'answer__player' }, round.kind === 'h2h' || round.kind === 'tiebreak' ? 'Team answer' : playerLabel(turn.player)),
      team.isAI ? h('span', { class: 'answer__thinking' }, 'is thinking', h('span', { class: 'dots' }, h('i'), h('i'), h('i'))) : null,
    ].filter((node): node is HTMLElement => node !== null),
    isAI: team.isAI,
    placeholder: team.isAI ? '' : round.board ? 'Answer any clue' : 'Type your answer',
    onSubmit: (text) => app.dispatch({ type: 'SUBMIT', text }),
  });

  const label = passes > 1 ? `${roundTitle(round)} · Pass ${turn.pass} of ${passes}` : roundTitle(round);
  const element = h(
    'main',
    { class: 'screen play' },
    gameHeader(app, label),
    h(
      'div',
      { class: 'play__grid' },
      renderQuestion({ question: round.question, board: round.board, given: round.given, teams: state.teams }),
      h('div', { class: 'play__side' }, answer.panel, renderPodiums(state)),
    ),
  );

  return { element, input: answer.input, clock: answer.clock, setHint: answer.setHint, lock: answer.lock };
}
