import * as Speech from 'expo-speech';
import type { Lang } from './numberWords';
import { chooseVoice, loadWebVoices, type VoiceInfo } from './voices';

export type VoicePick = Pick<VoiceInfo, 'language' | 'identifier'>;

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** Web: speechSynthesis read after `voiceschanged` (voices.ts). Native: expo-speech's list. (expo-speech's web list never resolves on a device with no voices.) */
async function listVoices(): Promise<VoiceInfo[]> {
  const web = await loadWebVoices();
  if (web) return web;
  try {
    const v = await withTimeout(Speech.getAvailableVoicesAsync(), 2000, [] as Speech.Voice[]);
    return v.map((x) => ({ language: x.language, identifier: x.identifier, name: x.name }));
  } catch { return []; }
}

export async function pickVoice(lang: Lang): Promise<VoicePick | null> {
  const v = chooseVoice(await listVoices(), lang);
  return v ? { language: v.language, identifier: v.identifier } : null;
}

export interface ReadPlan { voice: VoicePick; lang: Lang; /** true: the statement is read in English because the device has no voice for the app language */ fallback: boolean }

/** What to read and with which voice: the app language if the device has a voice for it, else the English statement with an English voice, else null. */
export async function planRead(lang: Lang): Promise<ReadPlan | null> {
  const own = await pickVoice(lang);
  if (own) return { voice: own, lang, fallback: false };
  if (lang !== 'en') {
    const en = await pickVoice('en');
    if (en) return { voice: en, lang: 'en', fallback: true };
  }
  return null;
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
