import { sound } from '../../audio/sound';
import { formatPoints, h, svg } from '../dom';
import { ICON_CLOSE, ICON_LOGO, ICON_SOUND_OFF, ICON_SOUND_ON } from '../icons';
import { GAME_NAME } from '../labels';

export function renderLogo(size: 'small' | 'large' = 'small'): HTMLElement {
  return h(
    'div',
    { class: `logo logo--${size}`, role: 'img', 'aria-label': GAME_NAME },
    svg(ICON_LOGO, 'logo__mark'),
    h('span', { class: 'logo__word' }, h('span', null, 'Rock'), h('span', { class: 'logo__gold' }, 'Bottom')),
  );
}

export function renderSoundToggle(soundOn: boolean, onToggle: () => void): HTMLButtonElement {
  // Both icons are present; CSS shows the one that matches aria-pressed.
  return h(
    'button',
    {
      class: `icon-btn${soundOn ? '' : ' icon-btn--off'}`,
      type: 'button',
      'aria-pressed': String(soundOn),
      'aria-label': soundOn ? 'Mute sound' : 'Turn sound on',
      title: soundOn ? 'Mute sound' : 'Turn sound on',
      onclick: () => {
        onToggle();
        sound.click();
      },
    },
    svg(ICON_SOUND_ON, 'icon-on'),
    svg(ICON_SOUND_OFF, 'icon-off'),
  );
}

export interface HeaderOptions {
  label: string;
  jackpot: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onQuit: () => void;
}

/** The bar across the top of every in-game screen. */
export function renderHeader(options: HeaderOptions): HTMLElement {
  return h(
    'header',
    { class: 'topbar' },
    renderLogo('small'),
    h('div', { class: 'topbar__label' }, options.label),
    h(
      'div',
      { class: 'topbar__tools' },
      h(
        'div',
        { class: 'jackpot-chip', title: 'Jackpot' },
        h('span', { class: 'jackpot-chip__label' }, 'Jackpot'),
        h('span', { class: 'jackpot-chip__value' }, formatPoints(options.jackpot)),
      ),
      renderSoundToggle(options.soundOn, options.onToggleSound),
      h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'Quit game', title: 'Quit game', onclick: options.onQuit },
        svg(ICON_CLOSE),
      ),
    ),
  );
}
