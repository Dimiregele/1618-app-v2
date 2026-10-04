// Asistentul vocal al aplicației. Un singur punct de intrare: speak() / stopSpeaking().
// Vocea e activată implicit în onboarding, dar utilizatorul o poate opri oricând
// (preferința se păstrează în AsyncStorage).
//
// Notă: pe iOS, expo-speech nu scoate sunet dacă telefonul e pe silent.

import { useCallback, useEffect, useState } from "react";
import * as Speech from "expo-speech";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "voice_assistant_enabled";
const LANGUAGE = "ro-RO";

let enabled = true;
let loaded = false;
const listeners = new Set<(value: boolean) => void>();

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored !== null) enabled = stored === "1";
  } catch {
    /* rămânem pe valoarea implicită */
  }
  listeners.forEach((l) => l(enabled));
}

export function stopSpeaking() {
  Speech.stop();
}

export function speak(text: string, opts?: { force?: boolean; onDone?: () => void }) {
  if (!enabled && !opts?.force) return;
  Speech.stop();
  Speech.speak(text, {
    language: LANGUAGE,
    rate: 0.97,
    pitch: 1.0,
    onDone: opts?.onDone,
  });
}

export async function setVoiceEnabled(value: boolean) {
  enabled = value;
  if (!value) Speech.stop();
  listeners.forEach((l) => l(value));
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    /* nu blocăm UI-ul pentru o preferință */
  }
}

export function useVoiceEnabled(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(enabled);

  useEffect(() => {
    listeners.add(setValue);
    ensureLoaded();
    return () => {
      listeners.delete(setValue);
    };
  }, []);

  const update = useCallback((next: boolean) => {
    setVoiceEnabled(next);
  }, []);

  return [value, update];
}
