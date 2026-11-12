import { sound } from '../../audio/sound';
import { h, prefersReducedMotion, svg, wait } from '../dom';
import { ICON_CHECK, ICON_CLOSE } from '../icons';
import { ScoreColumn } from './column';
import { fireConfetti } from './confetti';

export interface RevealOptions {
  /** Team giving the answer. */
  who: string;
  /** Extra context, such as "Player 1" or "Answer 2 of 3". */
  sub: string;
  answer: string;
  correct: boolean;
  score: number;
  timedOut: boolean;
  /** Works out the host's line once the column has stopped. */
  line: () => string;
  /** Banner shown when the column reaches zero. */
  zeroLabel: string;
  /** A jackpot-winning answer gets the bigger celebration. */
  jackpot: boolean;
  continueLabel: string;
  onContinue: () => void;
}

/**
 * The reveal: a full-screen spotlight on one answer while the score column
 * drops. Enter, Space or a tap skips the animation; Enter then continues.
 */
export class Stage {
  private element: HTMLElement | null = null;
  private column: ScoreColumn | null = null;
  private run = 0;

  get isOpen(): boolean {
    return this.element !== null;
  }

  open(options: RevealOptions): void {
    this.close();
    const run = ++this.run;
    const column = new ScoreColumn();
    this.column = column;

    const verdict = h('div', { class: 'stage__verdict', 'aria-live': 'assertive' });
    const line = h('p', { class: 'stage__line', 'aria-live': 'polite' });
    const button = h(
      'button',
      { class: 'btn btn--gold stage__continue', type: 'button', hidden: true },
      options.continueLabel,
    );
    const answer = h(
      'h2',
      { class: `stage__answer${options.timedOut ? ' stage__answer--none' : ''}` },
      options.answer,
    );

    const element = h(
      'div',
      { class: 'stage', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Answer reveal', tabindex: '-1' },
      h(
        'div',
        { class: 'stage__inner' },
        h(
          'div',
          { class: 'stage__text' },
          h('p', { class: 'stage__who' }, h('strong', null, options.who), h('span', null, options.sub)),
          answer,
          verdict,
          line,
          button,
        ),
        h('div', { class: 'stage__column' }, column.element),
      ),
    );
    this.element = element;

    let finished = false;
    const proceed = () => {
      if (!finished || run !== this.run) return;
      this.close();
      options.onContinue();
    };
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      proceed();
    });
    element.addEventListener('click', () => column.skip());
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (finished) return; // the focused button handles it
      event.preventDefault();
      column.skip();
    });

    document.body.append(element);
    element.focus();
    void this.play(run, options, column, verdict, line).then((completed) => {
      if (!completed) return;
      finished = true;
      button.hidden = false;
      button.focus();
    });
  }

  private async play(
    run: number,
    options: RevealOptions,
    column: ScoreColumn,
    verdict: HTMLElement,
    line: HTMLElement,
  ): Promise<boolean> {
    const alive = () => run === this.run && this.element !== null;
    const quick = prefersReducedMotion();
    const element = this.element as HTMLElement;

    // A beat of suspense before we find out whether the answer is right.
    verdict.replaceChildren(h('span', { class: 'stage__pending' }, 'Is it on the list?'));
    await wait(quick ? 150 : 1100);
    if (!alive()) return false;

    if (!options.correct) {
      element.setAttribute('data-result', 'wrong');
      verdict.replaceChildren(
        h(
          'div',
          { class: 'verdict verdict--wrong' },
          h('span', { class: 'verdict__icon' }, svg(ICON_CLOSE)),
          h('span', { class: 'verdict__score' }, '100'),
          h('span', { class: 'verdict__label' }, options.timedOut ? 'Out of time' : 'Wrong answer'),
        ),
      );
      await column.showWrong();
    } else {
      element.setAttribute('data-result', 'correct');
      sound.correct();
      verdict.replaceChildren(
        h(
          'div',
          { class: 'verdict verdict--correct' },
          h('span', { class: 'verdict__icon' }, svg(ICON_CHECK)),
          h('span', { class: 'verdict__label' }, 'Correct! How many said it?'),
        ),
      );
      await wait(quick ? 150 : 850);
      if (!alive()) return false;

      const outcome = await column.drop(
        options.score,
        options.jackpot ? () => sound.jackpot() : () => sound.fanfare(),
      );
      if (!alive()) return false;

      if (outcome === 'zero') {
        element.setAttribute('data-result', 'zero');
        fireConfetti(options.jackpot ? 1.8 : 1);
        verdict.replaceChildren(
          h(
            'div',
            { class: 'verdict verdict--zero' },
            h('span', { class: 'verdict__banner' }, options.zeroLabel),
            h('span', { class: 'verdict__label' }, 'Nobody said it. Zero points!'),
          ),
        );
      } else {
        element.setAttribute('data-result', 'scored');
        verdict.replaceChildren(
          h(
            'div',
            { class: 'verdict verdict--scored' },
            h('span', { class: 'verdict__score' }, options.score),
            h('span', { class: 'verdict__label' }, options.score === 1 ? 'point' : 'points'),
          ),
        );
      }
    }

    await wait(quick ? 50 : 450);
    if (!alive()) return false;
    line.textContent = options.line();
    line.classList.add('stage__line--shown');
    await wait(quick ? 50 : 350);
    return alive();
  }

  close(): void {
    this.run++;
    this.column?.destroy();
    this.column = null;
    this.element?.remove();
    this.element = null;
  }
}
