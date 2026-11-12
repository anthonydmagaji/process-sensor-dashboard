import { sound } from '../../audio/sound';
import { h } from '../dom';

/** The answer clock: a draining bar with the seconds left. */
export class Clock {
  readonly element: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly number: HTMLElement;
  private timer = 0;
  private lastWhole = 0;

  constructor() {
    this.bar = h('div', { class: 'clock__bar' });
    this.number = h('span', { class: 'clock__number' });
    this.element = h(
      'div',
      { class: 'clock', role: 'timer', 'aria-label': 'Time left', hidden: true },
      h('div', { class: 'clock__track' }, this.bar),
      this.number,
    );
  }

  /** Starts counting down; `onExpire` fires once when the time runs out. */
  start(seconds: number, onExpire: () => void): void {
    this.stop();
    const started = performance.now();
    this.lastWhole = seconds;
    this.element.hidden = false;
    this.paint(seconds, seconds);

    this.timer = window.setInterval(() => {
      const left = Math.max(0, seconds - (performance.now() - started) / 1000);
      this.paint(left, seconds);
      const whole = Math.ceil(left);
      if (whole < this.lastWhole) {
        this.lastWhole = whole;
        if (whole > 0) sound.clockTick(whole <= 5);
      }
      if (left <= 0) {
        this.stop();
        sound.timeUp();
        onExpire();
      }
    }, 100);
  }

  private paint(left: number, total: number): void {
    this.bar.style.transform = `scaleX(${left / total})`;
    this.number.textContent = String(Math.ceil(left));
    this.element.classList.toggle('clock--urgent', left <= 5);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }
}
