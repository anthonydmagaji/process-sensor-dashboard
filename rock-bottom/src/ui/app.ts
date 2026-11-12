import { sound } from '../audio/sound';
import { aiThinkingTime, chooseAiAnswer } from '../game/ai';
import { Commentator } from '../game/commentary';
import {
  FINAL_ANSWERS,
  currentTurn,
  finalIsSettled,
  givenKeys,
  givenWrong,
  initialState,
  nextJackpot,
  teamById,
  transition,
  type Context,
} from '../game/machine';
import { QUESTION_BANK, activeCandidates, candidatesOf } from '../game/questions';
import { Storage } from '../game/storage';
import type { GameEvent, GameState, Settings, TeamSetup } from '../game/types';
import type { AppApi } from './app-api';
import { fireConfetti } from './components/confetti';
import { confirmDialog } from './components/dialog';
import { Stage } from './components/stage';
import { ZERO_LABEL, playerLabel } from './labels';
import { renderFinalAnswer, renderFinalChoose, renderFinalReveal } from './screens/final';
import { renderGameOver } from './screens/gameover';
import { renderFinalIntro, renderRoundIntro } from './screens/intro';
import { renderPlay, type AnswerView } from './screens/play';
import { renderSetup } from './screens/setup';
import { ANSWER_SECONDS, FINAL_SECONDS } from './screens/shared';
import { renderSummary } from './screens/summary';

/** Delay before the clock starts, so the screen has settled and can be read. */
const CLOCK_GRACE_MS = 700;
const TYPING_MS = 38;

/**
 * The controller. It owns the game state, feeds events to the state machine
 * and turns each new state into a screen, timers, sounds and computer turns.
 */
export class App implements AppApi {
  state: GameState;
  readonly storage = new Storage();
  soundOn: boolean;

  private readonly context: Context = { bank: QUESTION_BANK, rng: Math.random };
  private commentator = new Commentator(Math.random);
  private readonly stage = new Stage();
  private view: AnswerView | null = null;
  /** Bumped whenever the screen changes, so stale timers do nothing. */
  private generation = 0;
  private timers: number[] = [];
  /** When the final's clock started, so it carries across the three answers. */
  private finalClockStart = 0;

  constructor(private readonly root: HTMLElement) {
    const settings = this.storage.getSettings();
    this.soundOn = settings.sound;
    sound.setMuted(!this.soundOn);
    this.state = initialState(settings, this.storage.getJackpot());

    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('keydown', (event) => this.redirectTyping(event));
    this.trackKeyboard();
    this.render();
  }

  // ------------------------------------------------------------- AppApi

  dispatch(event: GameEvent): void {
    const previous = this.state;
    const next = transition(previous, event, this.context);
    if (next === previous) return;
    this.state = next;
    this.afterTransition(previous, event);
  }

  startGame(settings: Settings, teams: TeamSetup[]): void {
    sound.unlock();
    this.storage.setSettings({ ...settings, sound: this.soundOn });
    this.commentator = new Commentator(Math.random);
    this.dispatch({
      type: 'START',
      settings,
      teams,
      jackpot: this.storage.getJackpot(),
      recentQuestionIds: this.storage.getRecentQuestionIds(),
    });
  }

  setSound(on: boolean): void {
    this.soundOn = on;
    sound.setMuted(!on);
    if (on) sound.unlock();
    this.storage.setSettings({ ...this.state.settings, sound: on });
    for (const button of this.root.querySelectorAll<HTMLElement>('.icon-btn[aria-pressed]')) {
      // Redraw header toggles in place rather than rebuilding the screen mid-turn.
      button.setAttribute('aria-pressed', String(on));
      button.classList.toggle('icon-btn--off', !on);
      button.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
      button.title = on ? 'Mute sound' : 'Turn sound on';
    }
  }

  quit(): void {
    void confirmDialog({
      title: 'Quit this game?',
      message: 'The game will end and the jackpot stays as it is.',
      confirmLabel: 'Quit game',
      cancelLabel: 'Keep playing',
    }).then((confirmed) => {
      if (!confirmed) {
        this.view?.input.focus();
        return;
      }
      this.stage.close();
      this.dispatch({ type: 'RESET' });
    });
  }

  playAgain(): void {
    this.dispatch({ type: 'RESET' });
  }

  // -------------------------------------------------------- transitions

  private afterTransition(previous: GameState, event: GameEvent): void {
    const state = this.state;

    // A blank or repeated answer: say so and keep the turn going.
    if (state.rejection && (event.type === 'SUBMIT' || event.type === 'FINAL_SUBMIT')) {
      this.showRejection();
      return;
    }

    if (state.phase === 'reveal' && previous.phase === 'awaitAnswer') {
      this.revealRoundAnswer();
      return;
    }

    if (state.phase === 'finalReveal' && event.type === 'FINAL_REVEAL') {
      this.revealFinalAnswer();
      return;
    }

    if (state.phase === 'gameOver' && previous.phase !== 'gameOver') this.saveResult();
    if (event.type === 'CHOOSE_CATEGORY') this.finalClockStart = 0;
    this.render();
  }

  private showRejection(): void {
    const rejection = this.state.rejection;
    if (!rejection || !this.view) return;
    sound.reject();
    this.view.setHint(
      rejection.reason === 'duplicate'
        ? `"${rejection.display}" has already been given. Try another answer.`
        : 'Type an answer first.',
      true,
    );
    this.view.input.select();
    this.view.input.focus();
  }

  private revealRoundAnswer(): void {
    const answer = this.state.lastAnswer;
    const round = this.state.round;
    if (!answer || !round) return;
    this.cancelTimers();
    this.view?.lock();
    sound.lockIn();
    const team = teamById(this.state, answer.teamId);

    this.stage.open({
      who: team.name,
      sub: round.kind === 'elim1' || round.kind === 'elim2' ? playerLabel(answer.player) : 'Team answer',
      answer: answer.display,
      correct: answer.correct,
      score: answer.score,
      timedOut: answer.timedOut,
      line: () =>
        this.commentator.line({
          answer: answer.display,
          team: team.name,
          score: answer.score,
          correct: answer.correct,
          timedOut: answer.timedOut,
        }),
      zeroLabel: ZERO_LABEL,
      jackpot: false,
      continueLabel: 'Continue',
      onContinue: () => this.dispatch({ type: 'CONTINUE' }),
    });
  }

  private revealFinalAnswer(): void {
    const final = this.state.final;
    if (!final) return;
    const index = final.revealed - 1;
    const answer = final.answers[index];
    const team = teamById(this.state, final.teamId);
    const settled = finalIsSettled(this.state);

    this.stage.open({
      who: team.name,
      sub: `Final answer ${index + 1} of ${FINAL_ANSWERS}`,
      answer: answer.display,
      correct: answer.correct,
      score: answer.score,
      timedOut: answer.timedOut,
      line: () => {
        if (final.won) return `That is the jackpot! ${answer.display} scores nothing at all, and ${team.name} have done it.`;
        if (settled) return answer.correct ? `${answer.score} for ${answer.display}, and that was the last chance.` : `${answer.display} is not right, and that was the last chance.`;
        if (!answer.correct) return `${answer.display} is not on the list. ${FINAL_ANSWERS - final.revealed} to go.`;
        return `${answer.score} people said ${answer.display}. Not the one, but there ${FINAL_ANSWERS - final.revealed === 1 ? 'is one answer' : 'are two answers'} left.`;
      },
      zeroLabel: 'Jackpot!',
      jackpot: true,
      continueLabel: settled ? 'See the result' : 'Next answer',
      onContinue: () => {
        if (settled) this.dispatch({ type: 'NEXT' });
        else {
          this.render();
          this.dispatch({ type: 'FINAL_REVEAL' });
        }
      },
    });
  }

  private saveResult(): void {
    const state = this.state;
    const won = state.final?.won ?? false;
    this.storage.setJackpot(nextJackpot(state));
    this.storage.addRecentQuestionIds(state.usedQuestionIds);
    this.storage.recordGame({
      trophies: state.teams.filter((team) => !team.isAI).reduce((sum, team) => sum + team.trophies, 0),
      jackpotWon: won && !teamById(state, state.final?.teamId ?? 0).isAI ? state.jackpot : null,
    });
  }

  // ------------------------------------------------------------- render

  private cancelTimers(): void {
    this.generation++;
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
    this.view?.clock.stop();
  }

  /** Runs a callback later unless the screen has changed in the meantime. */
  private later(ms: number, callback: () => void): void {
    const generation = this.generation;
    this.timers.push(
      window.setTimeout(() => {
        if (generation === this.generation) callback();
      }, ms),
    );
  }

  private show(element: HTMLElement): void {
    this.root.replaceChildren(element);
    window.scrollTo(0, 0);
    element.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }

  private render(): void {
    this.cancelTimers();
    this.stage.close();
    this.view = null;
    const state = this.state;

    switch (state.phase) {
      case 'setup':
        this.show(renderSetup(this));
        break;

      case 'roundIntro':
        sound.roundSting();
        this.show(renderRoundIntro(this));
        break;

      case 'awaitAnswer':
        this.beginTurn();
        break;

      case 'reveal':
        break; // the stage is showing; the screen underneath stays as it was

      case 'roundSummary': {
        const summary = state.summary;
        if (summary?.eliminatedId !== null && summary?.eliminatedId !== undefined) sound.eliminated();
        else if (summary?.pointWinnerId !== null && summary?.pointWinnerId !== undefined) sound.success();
        else sound.timeUp();
        this.show(renderSummary(this));
        break;
      }

      case 'finalIntro':
        sound.roundSting();
        this.show(renderFinalIntro(this));
        break;

      case 'finalChoose':
        this.show(renderFinalChoose(this));
        this.computerChoosesCategory();
        break;

      case 'finalAnswer':
        this.beginFinalAnswer();
        break;

      case 'finalReveal':
        this.show(renderFinalReveal(this));
        if (state.final?.revealed === 0) this.later(1100, () => this.dispatch({ type: 'FINAL_REVEAL' }));
        break;

      case 'gameOver':
        this.show(renderGameOver(this));
        if (state.final?.won) fireConfetti(1.2);
        else sound.commiserate();
        break;
    }
  }

  // -------------------------------------------------------------- turns

  private beginTurn(): void {
    const state = this.state;
    const round = state.round;
    const turn = currentTurn(state);
    if (!round || !turn) return;
    const team = teamById(state, turn.teamId);
    const view = renderPlay(this);
    this.view = view;
    this.show(view.element);

    const firstOfSecondPass = turn.pass === 2 && round.turns[round.turnIndex - 1]?.pass === 1;
    if (firstOfSecondPass) {
      view.setHint(
        round.board
          ? 'Second pass: a fresh board of clues.'
          : 'Second pass: same question, but answers already given are off the table.',
      );
    }

    if (team.isAI) {
      const taken = givenKeys(round.given);
      const open = activeCandidates(round.question, round.board).filter((candidate) => !taken.has(candidate.key));
      const choice = chooseAiAnswer(open, round.question.decoys, givenWrong(round.given), state.settings.difficulty, this.context.rng);
      this.computerAnswers(view, choice.text, () => {
        this.dispatch({ type: 'SUBMIT', text: choice.text });
        // A computer answer is never rejected, but never leave the game stuck if one is.
        if (this.state.phase === 'awaitAnswer') this.dispatch({ type: 'TIMEOUT' });
      });
      return;
    }

    view.input.focus({ preventScroll: true });
    if (state.settings.timer) {
      this.later(CLOCK_GRACE_MS, () =>
        view.clock.start(ANSWER_SECONDS, () => this.dispatch({ type: 'TIMEOUT', text: view.input.value })),
      );
    }
  }

  private beginFinalAnswer(): void {
    const state = this.state;
    const final = state.final;
    if (!final?.question) return;
    const team = teamById(state, final.teamId);
    const view = renderFinalAnswer(this);
    this.view = view;
    this.show(view.element);
    if (final.answers.length > 0) sound.lockIn();

    if (team.isAI) {
      const taken = givenKeys(final.answers);
      const open = candidatesOf(final.question).filter((candidate) => !taken.has(candidate.key));
      const choice = chooseAiAnswer(open, final.question.decoys, givenWrong(final.answers), state.settings.difficulty, this.context.rng);
      this.computerAnswers(view, choice.text, () => {
        this.dispatch({ type: 'FINAL_SUBMIT', text: choice.text });
        if (this.state.phase === 'finalAnswer' && this.state.rejection) this.dispatch({ type: 'FINAL_TIMEOUT' });
      });
      return;
    }

    view.input.focus({ preventScroll: true });
    if (state.settings.timer) {
      // One clock covers all three answers.
      if (this.finalClockStart === 0) this.finalClockStart = performance.now() + CLOCK_GRACE_MS;
      const left = FINAL_SECONDS - Math.max(0, performance.now() - this.finalClockStart) / 1000;
      view.setHint(`${FINAL_SECONDS} seconds for all three answers.`);
      view.clock.start(Math.max(1, left), () => this.dispatch({ type: 'FINAL_TIMEOUT', text: view.input.value }));
    }
  }

  /** Plays a computer turn: a thinking pause, the answer typed out, then submitted. */
  private computerAnswers(view: AnswerView, text: string, submit: () => void): void {
    const thinking = aiThinkingTime(this.state.settings.difficulty, this.context.rng);
    for (let pulse = 500; pulse < thinking; pulse += 650) this.later(pulse, () => sound.think());
    this.later(thinking, () => {
      view.element.querySelector('.answer__thinking')?.remove();
      for (let index = 1; index <= text.length; index++) {
        this.later(index * TYPING_MS, () => {
          view.input.value = text.slice(0, index);
        });
      }
      this.later(text.length * TYPING_MS + 450, submit);
    });
  }

  private computerChoosesCategory(): void {
    const final = this.state.final;
    if (!final || !teamById(this.state, final.teamId).isAI) return;
    const index = Math.min(final.options.length - 1, Math.floor(this.context.rng() * final.options.length));
    const option = final.options[index];
    this.later(1300, () => {
      this.root.querySelector(`.category[data-question="${option.id}"]`)?.classList.add('category--chosen');
      sound.click();
    });
    this.later(2400, () => this.dispatch({ type: 'CHOOSE_CATEGORY', questionId: option.id }));
  }

  /**
   * Publishes how much of the screen an on-screen keyboard covers, so the
   * answer box on a phone can sit just above it.
   */
  private trackKeyboard(): void {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(covered)}px`);
    };
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
  }

  /** Typing with nothing focused goes to the answer box, so focus never needs chasing. */
  private redirectTyping(event: KeyboardEvent): void {
    const input = this.view?.input;
    if (!input || input.disabled || input.readOnly || this.stage.isOpen) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    const target = event.target as HTMLElement | null;
    if (target && target !== document.body && target.closest('input, textarea, button, dialog, summary, a')) return;
    input.focus();
  }
}
