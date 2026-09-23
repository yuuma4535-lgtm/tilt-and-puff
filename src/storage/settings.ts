import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BurnSpeed } from '../types';

export type AppSettings = {
  /** Roll continuous burn rate preset */
  burnSpeed: BurnSpeed;
};

const KEY = '@tilt_and_puff/settings';

const DEFAULTS: AppSettings = {
  burnSpeed: 'normal',
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const speed = parsed.burnSpeed;
    if (speed === 'slow' || speed === 'normal' || speed === 'fast') {
      return { burnSpeed: speed };
    }
    return { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function setBurnSpeed(speed: BurnSpeed): Promise<AppSettings> {
  const next: AppSettings = { burnSpeed: speed };
  await saveSettings(next);
  return next;
}
