import type { Lang } from './numberWords';

/** Voice detection without expo-speech: it is the part that decides "no Bengali voice", so it has to be right and testable. */
export interface VoiceInfo { language: string; identifier: string; name?: string }

interface SynthLike {
  getVoices: () => { lang: string; voiceURI: string; name?: string }[];
  addEventListener?: (type: string, fn: () => void) => void;
  removeEventListener?: (type: string, fn: () => void) => void;
}
const synth = (): SynthLike | null => (globalThis as { speechSynthesis?: SynthLike }).speechSynthesis ?? null;
const map = (s: SynthLike): VoiceInfo[] => s.getVoices().map((v) => ({ language: v.lang, identifier: v.voiceURI, name: v.name }));

let cached: VoiceInfo[] | null = null;

/**
 * Browsers fill speechSynthesis.getVoices() asynchronously: right after page load it is usually empty, and a `voiceschanged` event follows
 * (Chrome, Android) or never comes (Safari, a device with no voices). So: return the list if it is already there; otherwise wait for
 * `voiceschanged`, then read getVoices() AFTER it, polling as a safety net, and give up after `timeoutMs`. `null` = no speechSynthesis at all.
 */
export async function loadWebVoices(timeoutMs = 3000): Promise<VoiceInfo[] | null> {
  const s = synth();
  if (!s) return null;
  if (cached?.length) return cached;
  let list = map(s);
  if (!list.length) {
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearInterval(poll);
        s.removeEventListener?.('voiceschanged', onChanged);
        resolve();
      };
      const onChanged = () => finish(); // the list is read again below, after the event
      s.addEventListener?.('voiceschanged', onChanged);
      const poll = setInterval(() => { if (s.getVoices().length) finish(); }, 200);
      const timer = setTimeout(finish, timeoutMs);
    });
    list = map(s);
  }
  if (list.length) cached = list;
  return list;
}
/** Test hook. */
export const resetVoiceCache = () => { cached = null; };

const norm = (l: string) => l.toLowerCase().replace('_', '-');
const ORDER: Record<Lang, string[]> = {
  bn: ['bn-in', 'bn-bd'], hi: ['hi-in'], en: ['en-in', 'en-gb', 'en-us'],
};
const PREFIX: Record<Lang, string[]> = { bn: ['bn', 'ben'], hi: ['hi', 'hin'], en: ['en'] };

/** Best voice for the language: the preferred regions first (Bengali: bn-IN, then bn-BD), then any voice of that language. */
export function chooseVoice(voices: VoiceInfo[], lang: Lang): VoiceInfo | null {
  const ofLang = voices.filter((v) => PREFIX[lang].some((p) => { const n = norm(v.language); return n === p || n.startsWith(`${p}-`); }));
  if (!ofLang.length) return null;
  for (const region of ORDER[lang]) {
    const hit = ofLang.find((v) => norm(v.language) === region);
    if (hit) return hit;
  }
  return ofLang[0]!;
}
