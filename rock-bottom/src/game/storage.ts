import { DEFAULT_SETTINGS, JACKPOT_START } from './machine';
import type { Difficulty, Settings } from './types';

const PREFIX = 'rock-bottom:';
const RECENT_LIMIT = 24;

/** The parts of the Web Storage API this module uses; lets tests pass a stand-in. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Records {
  gamesPlayed: number;
  jackpotsWon: number;
  trophies: number;
  biggestJackpot: number;
}

const EMPTY_RECORDS: Records = { gamesPlayed: 0, jackpotsWon: 0, trophies: 0, biggestJackpot: 0 };

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked, e.g. private browsing
  }
}

/** Saved game data. Every read falls back to a default, so the game works with storage unavailable. */
export class Storage {
  constructor(private readonly store: KeyValueStore | null = browserStore()) {}

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.store?.getItem(PREFIX + key);
      return raw === null || raw === undefined ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.store?.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the game carries on without saving.
    }
  }

  getJackpot(): number {
    const value = this.read<unknown>('jackpot', JACKPOT_START);
    return typeof value === 'number' && Number.isFinite(value) && value >= JACKPOT_START ? value : JACKPOT_START;
  }

  setJackpot(value: number): void {
    this.write('jackpot', value);
  }

  getSettings(): Settings {
    const saved = this.read<Partial<Settings>>('settings', {});
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
    const humanTeams = Number(saved.humanTeams);
    return {
      humanTeams: Number.isInteger(humanTeams) && humanTeams >= 1 && humanTeams <= 4 ? humanTeams : DEFAULT_SETTINGS.humanTeams,
      difficulty: difficulties.includes(saved.difficulty as Difficulty)
        ? (saved.difficulty as Difficulty)
        : DEFAULT_SETTINGS.difficulty,
      sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULT_SETTINGS.sound,
      timer: typeof saved.timer === 'boolean' ? saved.timer : DEFAULT_SETTINGS.timer,
    };
  }

  setSettings(settings: Settings): void {
    this.write('settings', settings);
  }

  getTeamNames(): string[] {
    const names = this.read<unknown>('teamNames', []);
    return Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string') : [];
  }

  setTeamNames(names: string[]): void {
    this.write('teamNames', names);
  }

  getRecentQuestionIds(): string[] {
    const ids = this.read<unknown>('recentQuestions', []);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  }

  /** Remembers the questions just played so the next games start with fresh ones. */
  addRecentQuestionIds(ids: string[]): void {
    const merged = [...this.getRecentQuestionIds().filter((id) => !ids.includes(id)), ...ids];
    this.write('recentQuestions', merged.slice(-RECENT_LIMIT));
  }

  getRecords(): Records {
    const saved = this.read<Partial<Records>>('records', {});
    const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);
    return {
      gamesPlayed: number(saved.gamesPlayed),
      jackpotsWon: number(saved.jackpotsWon),
      trophies: number(saved.trophies),
      biggestJackpot: number(saved.biggestJackpot),
    };
  }

  recordGame(result: { trophies: number; jackpotWon: number | null }): Records {
    const records = { ...EMPTY_RECORDS, ...this.getRecords() };
    records.gamesPlayed += 1;
    records.trophies += result.trophies;
    if (result.jackpotWon !== null) {
      records.jackpotsWon += 1;
      records.biggestJackpot = Math.max(records.biggestJackpot, result.jackpotWon);
    }
    this.write('records', records);
    return records;
  }
}
