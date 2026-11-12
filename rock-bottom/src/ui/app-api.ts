import type { Storage } from '../game/storage';
import type { GameEvent, GameState, Settings, TeamSetup } from '../game/types';

/** What screens are allowed to ask of the controller. */
export interface AppApi {
  readonly state: GameState;
  readonly storage: Storage;
  dispatch(event: GameEvent): void;
  startGame(settings: Settings, teams: TeamSetup[]): void;
  readonly soundOn: boolean;
  setSound(on: boolean): void;
  /** Asks for confirmation, then abandons the game. */
  quit(): void;
  /** Back to the setup screen after a finished game. */
  playAgain(): void;
}
