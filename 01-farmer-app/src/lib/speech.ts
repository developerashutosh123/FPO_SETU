import * as Speech from 'expo-speech';
import type { Lang } from './numberWords';

const PREFIX: Record<Lang, string> = { bn: 'bn', hi: 'hi', en: 'en' };
const PREFERRED: Record<Lang, string> = { bn: 'bn-IN', hi: 'hi-IN', en: 'en-IN' };

export interface VoicePick { language: string; identifier?: string }

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/**
 * Browsers load their voice list lazily, and expo-speech's web build never resolves getAvailableVoicesAsync() on a device with no voices at all
 * (it waits for a `voiceschanged` event that never comes). So each attempt is bounded, and an empty answer means "no voice".
 */
async function voices(): Promise<Speech.Voice[]> {
  for (let i = 0; i < 4; i++) {
    try {
      const v = await withTimeout(Speech.getAvailableVoicesAsync(), 800, [] as Speech.Voice[]);
      if (v.length) return v;
    } catch { return []; }
  }
  return [];
}

/** The best voice for the language, or null if the device has none (then the screen says so and keeps the text). */
export async function pickVoice(lang: Lang): Promise<VoicePick | null> {
  const all = await voices();
  const match = all.filter((v) => v.language.toLowerCase().replace('_', '-').startsWith(PREFIX[lang]));
  if (!match.length) return null;
  const best = match.find((v) => v.language.toLowerCase().replace('_', '-') === PREFERRED[lang].toLowerCase()) ?? match[0]!;
  return { language: best.language, identifier: best.identifier };
}

export interface ReadHandle { stop: () => void; done: Promise<void> }

/** Speaks the lines one after another (long single utterances get cut off by some browsers). `onLine(i)` fires as each line starts. */
export function speakLines(lines: string[], voice: VoicePick, onLine?: (i: number) => void): ReadHandle {
  let stopped = false;
  const done = (async () => {
    for (let i = 0; i < lines.length && !stopped; i++) {
      onLine?.(i);
      await new Promise<void>((resolve) => {
        Speech.speak(lines[i]!, {
          language: voice.language, voice: voice.identifier, rate: 0.9,
          onDone: () => resolve(), onStopped: () => resolve(), onError: () => resolve(),
        });
      });
    }
  })();
  return { stop: () => { stopped = true; Speech.stop(); }, done };
}
