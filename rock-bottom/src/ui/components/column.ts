import { sound } from '../../audio/sound';
import { h, prefersReducedMotion, wait } from '../dom';

/**
 * The score column: the heart of the show. It starts full at 100 and drains
 * towards the answer's score, ticking as it goes, then stops with a thud.
 */

/** Drop speed in points per second at a given height: fast at the top, tense near the floor. */
export function dropSpeed(value: number): number {
  if (value > 60) return 44;
  if (value > 30) return 31;
  if (value > 12) return 21;
  if (value > 4) return 11.5;
  return 6.5;
}

export type ColumnOutcome = 'zero' | 'scored' | 'wrong';

export class ScoreColumn {
  readonly element: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly marker: HTMLElement;
  private readonly readout: HTMLElement;
  private frame = 0;
  private skipRequested = false;
  private running = false;

  constructor() {
    this.readout = h('span', { class: 'column__value' }, '100');
    this.fill = h('div', { class: 'column__fill' });
    this.marker = h('div', { class: 'column__marker' }, this.readout);
    const scale = h(
      'div',
      { class: 'column__scale', 'aria-hidden': 'true' },
      [100, 75, 50, 25, 0].map((mark) => h('span', { style: `bottom:${mark}%` }, mark)),
    );
    this.element = h(
      'div',
      { class: 'column', 'data-state': 'idle', role: 'img', 'aria-label': 'Score column at 100' },
      scale,
      h(
        'div',
        { class: 'column__shaft' },
        h('div', { class: 'column__rungs', 'aria-hidden': 'true' }),
        this.fill,
        h('div', { class: 'column__floor', 'aria-hidden': 'true' }),
      ),
      this.marker,
    );
    this.set(100);
  }

  private set(value: number): void {
    const shown = Math.max(0, Math.ceil(value - 1e-6));
    this.fill.style.height = `${value}%`;
    this.marker.style.bottom = `${value}%`;
    this.readout.textContent = String(shown);
  }

  private setState(state: string): void {
    this.element.setAttribute('data-state', state);
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Jumps straight to the end of the current drop. */
  skip(): void {
    if (this.running) this.skipRequested = true;
  }

  /** A wrong answer: the column stays at 100, turns red and the buzzer sounds. */
  async showWrong(): Promise<ColumnOutcome> {
    this.set(100);
    this.setState('wrong');
    this.element.setAttribute('aria-label', 'Wrong answer: 100 points');
    sound.buzzer();
    await wait(prefersReducedMotion() ? 200 : 900);
    return 'wrong';
  }

  /**
   * Drains the column from 100 to the score. Resolves when it has stopped.
   * `zeroSound` is played if it reaches the floor (a fanfare by default).
   */
  drop(score: number, zeroSound: () => void = () => sound.fanfare()): Promise<ColumnOutcome> {
    const target = Math.max(0, Math.min(100, score));
    this.skipRequested = false;
    this.running = true;
    this.setState('dropping');
    sound.startDrop();

    return new Promise((resolve) => {
      let value = 100;
      let lastWhole = 100;
      let previous = performance.now();
      const instant = prefersReducedMotion();

      const finish = () => {
        this.running = false;
        this.set(target);
        sound.stopDrop();
        const outcome: ColumnOutcome = target === 0 ? 'zero' : 'scored';
        this.setState(outcome === 'zero' ? 'zero' : 'stopped');
        this.element.setAttribute('aria-label', `Score: ${target}`);
        if (outcome === 'zero') zeroSound();
        else sound.thud();
        resolve(outcome);
      };

      const step = (now: number) => {
        // Cap the frame time so a background tab cannot make the column leap.
        const elapsed = Math.min(0.05, (now - previous) / 1000);
        previous = now;
        value = Math.max(target, value - dropSpeed(value) * elapsed);
        if (this.skipRequested || instant) value = target;

        const whole = Math.ceil(value - 1e-6);
        if (whole < lastWhole) {
          lastWhole = whole;
          sound.tick(whole);
        }
        this.set(value);
        if (value <= target) finish();
        else this.frame = requestAnimationFrame(step);
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.running = false;
    sound.stopDrop();
  }
}
