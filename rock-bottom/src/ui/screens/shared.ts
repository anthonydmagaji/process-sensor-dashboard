import type { AppApi } from '../app-api';
import { renderHeader } from '../components/header';

export const ANSWER_SECONDS = 20;
export const FINAL_SECONDS = 60;

export function gameHeader(app: AppApi, label: string): HTMLElement {
  return renderHeader({
    label,
    jackpot: app.state.jackpot,
    soundOn: app.soundOn,
    onToggleSound: () => app.setSound(!app.soundOn),
    onQuit: () => app.quit(),
  });
}
