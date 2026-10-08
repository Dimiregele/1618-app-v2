// Asistentul vocal al aplicației.
//
// Ordinea încercărilor pentru fiecare replică:
//   1. voce naturală de pe server (funcția `tts`, cu cache; vezi supabase/functions/tts) redată cu expo-audio;
//   2. dacă serverul nu răspunde repede sau nu e configurat: vocea dispozitivului (expo-speech).
// Starea (vorbește, se încarcă, textul afișat) e publică prin useAssistantState(), ca avatarul să o poată arăta.
//
// Notă: pe iOS, vocea dispozitivului nu sună dacă telefonul e pe silent; redarea audio o forțăm cu playsInSilentMode.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "voice_assistant_enabled";
const LANGUAGE = "ro-RO";
const REMOTE_TIMEOUT_MS = 4500; // cât așteptăm vocea de pe server înainte să cădem pe vocea dispozitivului
const PLAYBACK_START_TIMEOUT_MS = 6000;
const REMOTE_BACKOFF_MS = 60_000; // după o eroare de configurare/rețea, nu mai încercăm serverul un minut

// ───────────── starea publică (pentru avatar) ─────────────

export type AssistantState = { speaking: boolean; loading: boolean; caption: string | null };

let state: AssistantState = { speaking: false, loading: false, caption: null };
const stateListeners = new Set<() => void>();

function setState(patch: Partial<AssistantState>) {
  state = { ...state, ...patch };
  stateListeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  stateListeners.add(cb);
  return () => {
    stateListeners.delete(cb);
  };
}

export function useAssistantState(): AssistantState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// ───────────── preferința (voce pornită / oprită) ─────────────

let enabled = true;
let loaded = false;
const enabledListeners = new Set<(value: boolean) => void>();

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored !== null) enabled = stored === "1";
  } catch {
    /* rămânem pe valoarea implicită */
  }
  enabledListeners.forEach((l) => l(enabled));
}

export async function setVoiceEnabled(value: boolean) {
  enabled = value;
  if (!value) stopSpeaking();
  enabledListeners.forEach((l) => l(value));
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* nu blocăm UI-ul pentru o preferință */
  }
}

export function useVoiceEnabled(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(enabled);
  useEffect(() => {
    enabledListeners.add(setValue);
    ensureLoaded();
    return () => {
      enabledListeners.delete(setValue);
    };
  }, []);
  const update = useCallback((next: boolean) => {
    void setVoiceEnabled(next);
  }, []);
  return [value, update];
}

// ───────────── voce naturală de pe server ─────────────

const clipCache = new Map<string, Promise<string | null>>();
let remoteDownUntil = 0;

function fetchClipUrl(text: string): Promise<string | null> {
  const cached = clipCache.get(text);
  if (cached) return cached;
  if (Date.now() < remoteDownUntil) return Promise.resolve(null);

  const promise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("tts", { body: { text } });
      if (error || !data?.url) {
        remoteDownUntil = Date.now() + REMOTE_BACKOFF_MS;
        clipCache.delete(text);
        return null;
      }
      return data.url as string;
    } catch {
      remoteDownUntil = Date.now() + REMOTE_BACKOFF_MS;
      clipCache.delete(text);
      return null;
    }
  })();
  clipCache.set(text, promise);
  return promise;
}

/** Cere în avans clipul unei replici (de ex. următoarea întrebare), ca să pornească instant când ajunge utilizatorul la ea. */
export function prefetch(text: string) {
  if (!enabled) return;
  void fetchClipUrl(text);
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

// ───────────── redare ─────────────

let token = 0; // crește la fiecare replică nouă; răspunsurile întârziate ale celor vechi sunt ignorate
let player: AudioPlayer | null = null;
let playerSub: { remove: () => void } | null = null;
let watchdog: ReturnType<typeof setTimeout> | null = null;
let last: { text: string; opts?: SpeakOptions } | null = null;

export type SpeakOptions = {
  /** Textul afișat în balon. Implicit textul rostit; `false` = fără balon. */
  caption?: string | false;
  /** Rostește chiar dacă vocea e oprită (de ex. la butonul „repetă”). */
  force?: boolean;
  /**
   * Text cu informații personale (rezultate, erori): se rostește DOAR cu vocea dispozitivului și nu se trimite
   * niciodată la server. Clipurile de pe server sunt publice (după hash), deci trebuie să conțină doar replici generice.
   */
  local?: boolean;
  onDone?: () => void;
};

function clearPlayer() {
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
  try {
    playerSub?.remove();
  } catch {
    /* ignorăm */
  }
  playerSub = null;
  try {
    player?.pause();
    player?.remove();
  } catch {
    /* ignorăm */
  }
  player = null;
}

export function stopSpeaking() {
  token++;
  clearPlayer();
  Speech.stop();
  setState({ speaking: false, loading: false });
}

function speakWithDevice(text: string, myToken: number, onDone?: () => void) {
  Speech.speak(text, {
    language: LANGUAGE,
    rate: 0.97,
    pitch: 1.0,
    onStart: () => {
      if (myToken === token) setState({ speaking: true, loading: false });
    },
    onDone: () => {
      if (myToken !== token) return;
      setState({ speaking: false, loading: false });
      onDone?.();
    },
    onStopped: () => {
      if (myToken === token) setState({ speaking: false, loading: false });
    },
    onError: () => {
      if (myToken === token) setState({ speaking: false, loading: false });
    },
  });
}

async function playRemote(url: string, text: string, myToken: number, onDone?: () => void) {
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {
    /* nu e critic */
  }
  if (myToken !== token) return;

  let started = false;
  const p = createAudioPlayer(url);
  player = p;

  playerSub = p.addListener("playbackStatusUpdate", (status) => {
    if (myToken !== token) return;
    if (status.playing && !started) {
      started = true;
      setState({ speaking: true, loading: false });
    }
    if (status.didJustFinish) {
      clearPlayer();
      setState({ speaking: false, loading: false });
      onDone?.();
    }
  });

  // Dacă redarea nu pornește (autoplay blocat, fișier indisponibil), cădem pe vocea dispozitivului.
  watchdog = setTimeout(() => {
    if (myToken !== token || started) return;
    clearPlayer();
    speakWithDevice(text, myToken, onDone);
  }, PLAYBACK_START_TIMEOUT_MS);

  try {
    p.play();
  } catch {
    if (myToken === token) {
      clearPlayer();
      speakWithDevice(text, myToken, onDone);
    }
  }
}

export async function speak(text: string, opts?: SpeakOptions) {
  last = { text, opts };
  const myToken = ++token;
  clearPlayer();
  Speech.stop();

  const caption = opts?.caption === false ? null : (opts?.caption ?? text);
  setState({ caption, speaking: false, loading: false });

  await ensureLoaded();
  if (myToken !== token) return;
  if (!enabled && !opts?.force) return;

  if (opts?.local) {
    speakWithDevice(text, myToken, opts?.onDone);
    return;
  }

  setState({ loading: true });
  const url = await withTimeout(fetchClipUrl(text), REMOTE_TIMEOUT_MS, null);
  if (myToken !== token) return;

  if (url) await playRemote(url, text, myToken, opts?.onDone);
  else speakWithDevice(text, myToken, opts?.onDone);
}

/** Repetă ultima replică (atingi avatarul). */
export function replay() {
  if (last) void speak(last.text, { ...last.opts, force: true });
}

/** Șterge balonul fără să oprească sunetul. */
export function clearCaption() {
  setState({ caption: null });
}
