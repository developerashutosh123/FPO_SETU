import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chooseVoice, loadWebVoices, resetVoiceCache, type VoiceInfo } from './voices';

const v = (language: string, name = language): VoiceInfo => ({ language, identifier: name, name });

describe('chooseVoice', () => {
  it('prefers bn-IN, then bn-BD, then any Bengali voice', () => {
    expect(chooseVoice([v('en-US'), v('bn-BD'), v('bn-IN')], 'bn')?.language).toBe('bn-IN');
    expect(chooseVoice([v('bn-BD'), v('en-IN')], 'bn')?.language).toBe('bn-BD');
    expect(chooseVoice([v('bn'), v('en-IN')], 'bn')?.language).toBe('bn');
    expect(chooseVoice([v('bn_IN')], 'bn')?.language).toBe('bn_IN'); // some Android engines use an underscore
  });
  it('returns null when there is no Bengali voice, and does not mistake other languages for it', () => {
    expect(chooseVoice([v('en-US'), v('hi-IN'), v('bnx-XX')], 'bn')).toBeNull();
    expect(chooseVoice([], 'bn')).toBeNull();
  });
  it('English fallback prefers en-IN, then en-GB, then en-US', () => {
    expect(chooseVoice([v('en-US'), v('en-GB'), v('en-IN')], 'en')?.language).toBe('en-IN');
    expect(chooseVoice([v('en-US'), v('en-GB')], 'en')?.language).toBe('en-GB');
    expect(chooseVoice([v('fr-FR'), v('en-AU')], 'en')?.language).toBe('en-AU');
  });
});

describe('loadWebVoices: read the list after voiceschanged', () => {
  const g = globalThis as Record<string, unknown>;
  beforeEach(() => resetVoiceCache());
  afterEach(() => { delete g.speechSynthesis; });

  const fakeSynth = () => {
    const target = new EventTarget();
    let voices: { lang: string; voiceURI: string; name: string }[] = [];
    const synth = {
      getVoices: () => voices,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      load: (list: typeof voices, fire = true) => { voices = list; if (fire) target.dispatchEvent(new Event('voiceschanged')); },
    };
    g.speechSynthesis = synth;
    return synth;
  };

  it('a list that is empty at first and filled later is NOT mistaken for "no voice"', async () => {
    const synth = fakeSynth();
    const p = loadWebVoices(2000);
    setTimeout(() => synth.load([{ lang: 'bn-IN', voiceURI: 'bn1', name: 'Bengali' }]), 150);
    const list = await p;
    expect(chooseVoice(list!, 'bn')?.identifier).toBe('bn1');
  });
  it('also works when the event never fires but the list fills (polling safety net)', async () => {
    const synth = fakeSynth();
    const p = loadWebVoices(2000);
    setTimeout(() => synth.load([{ lang: 'en-IN', voiceURI: 'e1', name: 'English' }], false), 300);
    expect((await p)!.map((x) => x.identifier)).toEqual(['e1']);
  });
  it('returns at once when voices are already there', async () => {
    const synth = fakeSynth();
    synth.load([{ lang: 'bn-BD', voiceURI: 'b', name: 'B' }], false);
    const t0 = Date.now();
    expect((await loadWebVoices(2000))!.length).toBe(1);
    expect(Date.now() - t0).toBeLessThan(100);
  });
  it('gives up after the timeout with an empty list when the device has no voices', async () => {
    fakeSynth();
    expect(await loadWebVoices(400)).toEqual([]);
  });
  it('null when speechSynthesis does not exist (native: use the expo-speech list instead)', async () => {
    expect(await loadWebVoices(100)).toBeNull();
  });
});
