import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyCounts, WeekSeries } from '../types';

const KEY_PREFIX = '@tilt_and_puff/daily/';
const SESSION_COUNT_KEY = '@tilt_and_puff/session_count';

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${KEY_PREFIX}${y}-${m}-${day}`;
}

function dateKeyOffset(daysAgo: number): { key: string; label: string } {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const label = `${m}/${day}`;
  return { key: `${KEY_PREFIX}${y}-${m}-${day}`, label };
}

const EMPTY: DailyCounts = { butts: 0, stubs: 0 };

export async function loadTodayCounts(): Promise<DailyCounts> {
  const raw = await AsyncStorage.getItem(todayKey());
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as DailyCounts;
    return {
      butts: parsed.butts ?? 0,
      stubs: parsed.stubs ?? 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

async function writeToday(counts: DailyCounts): Promise<void> {
  await AsyncStorage.setItem(todayKey(), JSON.stringify(counts));
}

export async function incrementButts(): Promise<DailyCounts> {
  const current = await loadTodayCounts();
  const next = { ...current, butts: current.butts + 1 };
  await writeToday(next);
  return next;
}

export async function incrementStubs(): Promise<DailyCounts> {
  const current = await loadTodayCounts();
  const next = { ...current, stubs: current.stubs + 1 };
  await writeToday(next);
  return next;
}

/** Oldest → today (7 days) for chart-kit */
export async function loadWeekSeries(): Promise<WeekSeries> {
  const labels: string[] = [];
  const butts: number[] = [];
  const stubs: number[] = [];

  for (let ago = 6; ago >= 0; ago -= 1) {
    const { key, label } = dateKeyOffset(ago);
    labels.push(label);
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      butts.push(0);
      stubs.push(0);
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as DailyCounts;
      butts.push(parsed.butts ?? 0);
      stubs.push(parsed.stubs ?? 0);
    } catch {
      butts.push(0);
      stubs.push(0);
    }
  }

  return { labels, butts, stubs };
}

export async function bumpSessionCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(SESSION_COUNT_KEY);
  const next = (raw ? Number(raw) : 0) + 1;
  await AsyncStorage.setItem(SESSION_COUNT_KEY, String(next));
  return next;
}
