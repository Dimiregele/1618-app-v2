import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Alert, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { prefetch, speak, stopSpeaking } from "@/lib/voice";
import { deriveProfile } from "@/lib/profile";
import {
  SECTION,
  pruneAnswers,
  visibleQuestions,
  type Answers,
  type Option,
  type Question,
} from "@/lib/questionnaire";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Button } from "@/components/Button";
import { StepIndicator } from "@/components/StepIndicator";
import { VoiceToggle } from "@/components/VoiceToggle";
import { Assistant } from "@/components/Assistant";
import { color, font, radius, space, type } from "@/theme";

const AUTO_ADVANCE_MS = 280;
const draftKey = (scanId: string) => `questionnaire_draft_v3_${scanId}`;

function tap() {
  Haptics.selectionAsync().catch(() => {});
}

export default function Questionnaire() {
  const router = useRouter();
  const { scanId, quality } = useLocalSearchParams<{ scanId: string; quality?: string }>();

  const [answers, setAnswers] = useState<Answers>({});
  const [currentId, setCurrentId] = useState<string>(() => visibleQuestions({})[0].id);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [numText, setNumText] = useState("");
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const questions = useMemo(() => visibleQuestions(answers), [answers]);
  const index = Math.max(0, questions.findIndex((q) => q.id === currentId));
  const question = questions[index];
  const selected = answers[question.id];
  const prev = questions[index - 1];
  const firstInSection = !prev || prev.section !== question.section;

  // ───── draft: reluăm de unde ai rămas (inclusiv după un refresh pe web) ─────
  useEffect(() => {
    if (!scanId) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey(scanId));
        if (raw) {
          const draft = JSON.parse(raw) as { answers: Answers; currentId: string };
          const restored = pruneAnswers(draft.answers ?? {});
          setAnswers(restored);
          const list = visibleQuestions(restored);
          if (list.some((q) => q.id === draft.currentId)) setCurrentId(draft.currentId);
        }
      } catch {
        /* draft corupt: pornim de la început */
      }
      setReady(true);
    })();
  }, [scanId]);

  useEffect(() => {
    if (!ready || !scanId) return;
    AsyncStorage.setItem(draftKey(scanId), JSON.stringify({ answers, currentId })).catch(() => {});
  }, [answers, currentId, ready, scanId]);

  // ───── progres ─────
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(index / questions.length, { duration: 420 });
  }, [index, questions.length, progress]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // ───── asistentul vocal: introducere pe secțiune + întrebarea ─────
  useEffect(() => {
    if (!ready) return;
    const q = question.spoken ?? question.title;
    if (firstInSection) {
      const intro = SECTION[question.section].intro;
      speak(`${intro} ${q}`, { caption: intro });
    } else {
      speak(q, { caption: false });
    }
    // Pregătim în avans replica următoarei întrebări.
    const next = questions[index + 1];
    if (next) prefetch(next.spoken ?? next.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, ready]);

  // câmpul numeric își ia valoarea salvată când schimbăm întrebarea
  useEffect(() => {
    const v = answers[question.id];
    setNumText(typeof v === "number" ? String(v) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  useEffect(
    () => () => {
      stopSpeaking();
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  // ───── navigare ─────
  function goNext(nextAnswers: Answers) {
    const list = visibleQuestions(nextAnswers);
    const i = list.findIndex((q) => q.id === question.id);
    const next = list[i + 1];
    if (next) setCurrentId(next.id);
    else void submit(nextAnswers);
  }

  function goBack() {
    if (index === 0) {
      router.back();
      return;
    }
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setCurrentId(questions[index - 1].id);
  }

  function choose(option: Option) {
    tap();
    if (question.type === "single") {
      const next = pruneAnswers({ ...answers, [question.id]: option.value });
      setAnswers(next);
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => goNext(next), AUTO_ADVANCE_MS);
      return;
    }
    const current = Array.isArray(selected) ? selected : [];
    let nextValue: string[];
    if (option.exclusive) {
      nextValue = current.includes(option.value) ? [] : [option.value];
    } else {
      const withoutExclusive = current.filter((v) => !question.options?.find((o) => o.value === v)?.exclusive);
      if (withoutExclusive.includes(option.value)) {
        nextValue = withoutExclusive.filter((v) => v !== option.value);
      } else {
        nextValue = [...withoutExclusive, option.value];
        // La „alege cel mult N”, ultima alegere o înlocuiește pe cea mai veche.
        if (question.maxSelect && nextValue.length > question.maxSelect) {
          nextValue = nextValue.slice(nextValue.length - question.maxSelect);
        }
      }
    }
    setAnswers(pruneAnswers({ ...answers, [question.id]: nextValue }));
  }

  const parsedNumber = useMemo(() => {
    if (question.type !== "number" || !question.number) return null;
    const n = Number(numText.replace(",", "."));
    if (!numText.trim() || !Number.isFinite(n)) return null;
    if (n < question.number.min || n > question.number.max) return null;
    return Math.round(n * 10) / 10;
  }, [numText, question]);

  function submitNumber() {
    if (parsedNumber === null) return;
    tap();
    const next = pruneAnswers({ ...answers, [question.id]: parsedNumber });
    setAnswers(next);
    goNext(next);
  }

  async function submit(finalAnswers: Answers) {
    if (!scanId) {
      Alert.alert("Lipsește scanarea", "Repetă scanarea și încearcă din nou.");
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      Alert.alert("Sesiune expirată", "Te rugăm să te autentifici din nou.");
      router.replace("/(auth)/login");
      return;
    }
    const pruned = pruneAnswers(finalAnswers);
    const { error } = await supabase.from("questionnaire_responses").insert({
      user_id: user.id,
      scan_id: scanId,
      answers: { schema_version: 3, ...pruned, derived: deriveProfile(pruned) },
    });
    setSaving(false);
    if (error) {
      Alert.alert("Nu am reușit să salvăm răspunsurile", error.message);
      return;
    }
    AsyncStorage.removeItem(draftKey(scanId)).catch(() => {});
    stopSpeaking();
    router.push({ pathname: "/results", params: { scanId, ...(quality ? { quality } : {}) } });
  }

  if (!ready) return <ScreenContainer center>{null}</ScreenContainer>;

  const isLast = index === questions.length - 1;
  const canContinueMulti = question.type === "multi" && Array.isArray(selected) && selected.length > 0;

  return (
    <ScreenContainer>
      <StepIndicator step={2} total={4} />

      <View style={styles.topRow}>
        <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Înapoi">
          <Text style={styles.back}>← Înapoi</Text>
        </Pressable>
        <VoiceToggle />
      </View>

      <Assistant size={52} idleHint="Atinge-mă ca să repet întrebarea." />

      <View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
        <Text style={styles.counter}>
          {SECTION[question.section].label} · întrebarea {index + 1} din {questions.length}
        </Text>
      </View>

      <Animated.View
        key={question.id}
        entering={FadeInRight.duration(320)}
        exiting={FadeOutLeft.duration(160)}
        style={{ gap: space.md }}
      >
        <View style={{ gap: space.xs }}>
          <Text style={type.h1}>{question.title}</Text>
          <Text style={type.bodyMuted}>{question.why}</Text>
          {question.type === "multi" && (
            <Text style={styles.multiHint}>
              {question.maxSelect ? `Alege cel mult ${question.maxSelect}.` : "Poți alege mai multe răspunsuri."}
            </Text>
          )}
        </View>

        {question.type === "number" && question.number ? (
          <NumberField
            spec={question.number}
            text={numText}
            onChangeText={setNumText}
            valid={parsedNumber !== null}
            onSubmit={submitNumber}
          />
        ) : (
          <View style={{ gap: space.xs + 2 }}>
            {question.options?.map((option, i) => (
              <Animated.View key={option.value} entering={FadeInDown.delay(60 + i * 45).duration(300)}>
                <OptionCard
                  option={option}
                  multi={question.type === "multi"}
                  active={Array.isArray(selected) ? selected.includes(option.value) : selected === option.value}
                  onPress={() => choose(option)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </Animated.View>

      {question.type === "multi" && (
        <Button
          label={isLast ? "Vezi rezultatele" : "Continuă"}
          onPress={() => goNext(answers)}
          disabled={!canContinueMulti}
          loading={saving}
        />
      )}
      {question.type === "number" && (
        <Button
          label={isLast ? "Vezi rezultatele" : "Continuă"}
          onPress={submitNumber}
          disabled={parsedNumber === null}
          loading={saving}
        />
      )}
      {question.type === "single" && saving && <Button label="Salvăm..." onPress={() => {}} loading />}
    </ScreenContainer>
  );
}

function NumberField({
  spec,
  text,
  onChangeText,
  valid,
  onSubmit,
}: {
  spec: NonNullable<Question["number"]>;
  text: string;
  onChangeText: (t: string) => void;
  valid: boolean;
  onSubmit: () => void;
}) {
  const showError = text.trim().length > 0 && !valid;
  return (
    <View style={{ gap: space.xs }}>
      <View style={[styles.numberBox, showError && { borderColor: color.danger }]}>
        <TextInput
          value={text}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder={spec.placeholder}
          placeholderTextColor={color.bark}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
          autoFocus
          style={styles.numberInput}
          accessibilityLabel={spec.unit}
        />
        <Text style={styles.unit}>{spec.unit}</Text>
      </View>
      {showError && (
        <Text style={[type.bodyMuted, { color: color.danger }]}>
          Introdu o valoare între {spec.min} și {spec.max} {spec.unit}.
        </Text>
      )}
    </View>
  );
}

function OptionCard({
  option,
  active,
  multi,
  onPress,
}: {
  option: Option;
  active: boolean;
  multi: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        onPressIn={() => (scale.value = withSpring(0.975, { damping: 18, stiffness: 320 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 14, stiffness: 260 }))}
        accessibilityRole={multi ? "checkbox" : "radio"}
        accessibilityState={{ checked: active }}
        style={[styles.option, active && styles.optionActive]}
      >
        <View style={[styles.mark, multi ? styles.markSquare : styles.markRound, active && styles.markActive]}>
          {active && <Text style={styles.markTick}>✓</Text>}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.optionLabel, active && { color: color.paper }]}>{option.label}</Text>
          {option.hint ? (
            <Text style={[styles.optionHint, active && { color: "rgba(250,246,240,0.75)" }]}>{option.hint}</Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { fontFamily: font.bodySemibold, fontSize: 14, color: color.bark },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: color.line, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: color.glow },
  counter: { fontFamily: font.bodySemibold, fontSize: 12, color: color.bark, marginTop: space.xs, letterSpacing: 0.4 },
  multiHint: { fontFamily: font.bodyMedium, fontSize: 13, color: color.glowDeep },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm + 3,
    paddingHorizontal: space.sm + 3,
    borderRadius: radius.hero / 2,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: "#FFFDF9",
  },
  optionActive: { backgroundColor: color.ink, borderColor: color.ink },
  optionLabel: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 22, color: color.ink },
  optionHint: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: color.bark },
  mark: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderColor: color.bark,
    alignItems: "center",
    justifyContent: "center",
  },
  markRound: { borderRadius: 12 },
  markSquare: { borderRadius: 6 },
  markActive: { backgroundColor: color.glow, borderColor: color.glow },
  markTick: { color: color.ink, fontSize: 14, fontFamily: font.bodySemibold, lineHeight: 16 },
  numberBox: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
    borderWidth: 1.5,
    borderColor: color.ink,
    borderRadius: radius.hero / 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: "#FFFDF9",
  },
  numberInput: { flex: 1, fontFamily: font.display, fontSize: 40, color: color.ink, paddingVertical: space.xs },
  unit: { fontFamily: font.bodySemibold, fontSize: 18, color: color.bark },
});
