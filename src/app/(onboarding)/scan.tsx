import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, Alert, Linking, Platform, Pressable, StyleSheet } from "react-native";
import { useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { runScan } from "@/lib/faceScan";
import { speak, stopSpeaking } from "@/lib/voice";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Button } from "@/components/Button";
import { StepIndicator } from "@/components/StepIndicator";
import { VoiceToggle } from "@/components/VoiceToggle";
import { Assistant } from "@/components/Assistant";
import { FaceScanner } from "@/components/FaceScanner";
import type { ScanMeta, ScanShots } from "@/components/faceScannerTypes";
import { color, font, radius, space, type } from "@/theme";

type Phase = "intro" | "capture" | "review" | "analyzing";

const IS_WEB = Platform.OS === "web";

const CHECKLIST = [
  "Lumină naturală sau lumină albă în fața ta, nu în spatele tău",
  "Fără ochelari, șapcă sau păr peste față",
  "Față relaxată, fără machiaj greu sau filtre",
  IS_WEB ? "Camera la nivelul ochilor, la lungimea brațului" : "Telefonul la lungimea brațului, ținut vertical",
];

const INTRO_SPOKEN =
  "Bună, sunt Phi. Facem o scanare facială în mai multe unghiuri, ca la deblocarea cu fața. Eu îți spun pas cu pas ce să faci și fac pozele singură când totul e în regulă.";

const ANGLE_LABEL: { key: keyof ScanShots; label: string }[] = [
  { key: "front", label: "Față" },
  { key: "left", label: "Stânga" },
  { key: "right", label: "Dreapta" },
  { key: "down", label: "Scalp" },
];

function buzz(kind: "light" | "success" = "light") {
  if (IS_WEB) return;
  if (kind === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export default function ScanScreen() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("intro");
  const [consent, setConsent] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [shots, setShots] = useState<ScanShots | null>(null);
  const [meta, setMeta] = useState<ScanMeta | null>(null);
  const spokenIntro = useRef(false);

  useEffect(() => {
    if (phase === "intro" && !spokenIntro.current) {
      spokenIntro.current = true;
      speak(INTRO_SPOKEN);
    }
  }, [phase]);

  useEffect(() => () => stopSpeaking(), []);

  async function startCapture() {
    if (!consent) return;
    buzz();
    stopSpeaking();
    // Pe web, permisiunea o cere browserul când pornește fluxul video (vezi FaceScanner.web).
    if (!IS_WEB && !permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    setShots(null);
    setMeta(null);
    setPhase("capture");
  }

  async function pickFromLibrary() {
    if (!consent) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      if (result.canceled) return;
      setShots({ front: result.assets[0].uri });
      setMeta({ mode: "basic", poses: 1, forced: true });
      setPhase("review");
    } catch (err) {
      Alert.alert("Nu am putut deschide galeria", err instanceof Error ? err.message : String(err));
    }
  }

  function onScanComplete(result: ScanShots, m: ScanMeta) {
    buzz("success");
    setShots(result);
    setMeta(m);
    setPhase("review");
    speak(
      m.poses > 1
        ? `Gata, am ${m.poses} unghiuri. Verifică pozele și apasă Analizează.`
        : "Gata, am poza. Verific-o și apasă Analizează.",
    );
  }

  async function analyzeAndContinue() {
    if (!shots) return;
    setPhase("analyzing");
    speak("Îți analizez fața. Durează câteva secunde.");
    try {
      const outcome = await runScan(shots);
      stopSpeaking();
      const unclear = !outcome.quality.ok || !!outcome.quality.issue;
      router.push({
        pathname: "/(onboarding)/questionnaire",
        params: {
          scanId: outcome.scanId,
          ...(unclear ? { quality: outcome.quality.issue ?? "unclear" } : {}),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Eroare necunoscută";
      speak(message, { local: true });
      Alert.alert("Scanarea a eșuat", message);
      setPhase("review");
    }
  }

  const present = useMemo(() => ANGLE_LABEL.filter((a) => shots?.[a.key]), [shots]);

  // ═════════════════ CAPTURE ═════════════════
  if (phase === "capture") {
    return (
      <FaceScanner
        onComplete={onScanComplete}
        onCancel={() => {
          stopSpeaking();
          setPhase("intro");
        }}
      />
    );
  }

  // ═════════════════ INTRO ═════════════════
  if (phase === "intro") {
    const denied = !IS_WEB && permission && !permission.granted && !permission.canAskAgain;
    return (
      <ScreenContainer>
        <StepIndicator step={1} total={4} />
        <VoiceToggle />

        <Animated.View entering={FadeInDown.duration(360)} style={{ gap: space.sm }}>
          <Assistant size={64} idleHint="Atinge-mă ca să repet" />
          <Text style={type.h1}>Scanare facială</Text>
          <Text style={type.bodyMuted}>
            {IS_WEB
              ? "Camera urmărește fața ta în timp real cu un mesh 3D de 478 de puncte și te ghidează: din față, apoi din profil, apoi cu capul în jos pentru scalp. Pozele se fac automat când lumina, distanța și poziția sunt bune."
              : "Facem trei poze (din față și din profil), pe care le verificăm pe loc: lumină, claritate și încadrare."}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(360)} style={styles.checklist}>
          <Text style={type.label}>ÎNAINTE SĂ ÎNCEPEM</Text>
          {CHECKLIST.map((item) => (
            <View key={item} style={styles.checkRow}>
              <Text style={styles.checkDot}>◦</Text>
              <Text style={[type.body, { flex: 1 }]}>{item}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(360)}>
          <Pressable
            onPress={() => {
              buzz();
              setConsent(!consent);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            style={styles.consent}
          >
            <View style={[styles.box, consent && styles.boxOn]}>{consent && <Text style={styles.tick}>✓</Text>}</View>
            <Text style={[type.bodyMuted, { flex: 1 }]}>
              Sunt de acord ca fața mea să fie analizată pentru recomandările din aplicație. Imaginea nu se
              stochează; păstrăm doar rezultatul analizei. Pot șterge datele oricând.
            </Text>
          </Pressable>
        </Animated.View>

        {denied && (
          <View style={styles.notice}>
            <Text style={[type.bodyMuted, { color: color.glowDeep }]}>
              Accesul la cameră e dezactivat. Activează-l din setările telefonului ca să putem scana.
            </Text>
            <Button label="Deschide setările" variant="secondary" onPress={() => Linking.openSettings()} />
          </View>
        )}

        <Button label="Începe scanarea" onPress={startCapture} disabled={!consent || !!denied} />
        <Button label="Încarc o poză din galerie" variant="ghost" onPress={pickFromLibrary} disabled={!consent} />
      </ScreenContainer>
    );
  }

  // ═════════════════ REVIEW / ANALYZING ═════════════════
  const analyzing = phase === "analyzing";
  return (
    <ScreenContainer>
      <StepIndicator step={1} total={4} />
      <View style={{ gap: space.xs }}>
        <Text style={type.h1}>{analyzing ? "Analizăm scanarea" : "Verifică pozele"}</Text>
        <Text style={type.bodyMuted}>
          {analyzing
            ? "Analiza pielii, a părului și a zonei ochilor se face într-o singură trecere, pe toate unghiurile."
            : meta?.poses && meta.poses > 1
              ? "Dacă o poză nu arată bine, poți reface scanarea."
              : "Cu o singură poză din față analiza e mai puțin precisă. Scanarea ghidată dă rezultate mai bune."}
        </Text>
      </View>

      <View style={styles.hero}>
        {shots?.front && <Image source={{ uri: shots.front }} style={styles.heroImage} />}
        {analyzing && <AnalyzeBeam />}
      </View>

      {present.length > 1 && (
        <View style={styles.thumbRow}>
          {present.map((a) => (
            <View key={a.key} style={styles.thumbWrap}>
              <Image source={{ uri: shots![a.key]! }} style={styles.thumb} />
              <Text style={styles.thumbLabel}>{a.label}</Text>
            </View>
          ))}
        </View>
      )}

      {analyzing ? (
        <AnalyzeStatus />
      ) : (
        <>
          <Button label="Analizează" onPress={analyzeAndContinue} disabled={!shots?.front} />
          <Button label="Reia scanarea" variant="ghost" onPress={startCapture} />
        </>
      )}
    </ScreenContainer>
  );
}

// Linie luminoasă care se plimbă peste poză cât rulează analiza.
function AnalyzeBeam() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [t]);
  const style = useAnimatedStyle(() => ({ top: `${t.value * 96}%` }));
  return <Animated.View pointerEvents="none" style={[styles.analyzeBeam, style]} exiting={FadeOut} />;
}

const ANALYZE_STEPS = [
  "Trimitem scanarea în siguranță",
  "Analizăm textura și tonul pielii",
  "Verificăm scalpul și linia părului",
  "Evaluăm zona ochilor",
  "Pregătim recomandările",
];

function AnalyzeStatus() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => Math.min(n + 1, ANALYZE_STEPS.length - 1)), 2200);
    return () => clearInterval(id);
  }, []);
  const label = useMemo(() => ANALYZE_STEPS[i], [i]);
  return (
    <Animated.View key={label} entering={FadeIn.duration(300)} style={styles.analyzeStatus}>
      <Text style={styles.analyzeText}>{label}...</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  checklist: { gap: space.xs, padding: space.md, backgroundColor: "#F3ECE0", borderRadius: radius.sm },
  checkRow: { flexDirection: "row", gap: space.xs, alignItems: "flex-start" },
  checkDot: { fontFamily: font.bodySemibold, fontSize: 16, color: color.glowDeep, lineHeight: 23 },
  consent: { flexDirection: "row", gap: space.sm, alignItems: "flex-start" },
  box: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderColor: color.bark,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  boxOn: { backgroundColor: color.glow, borderColor: color.glow },
  tick: { color: color.ink, fontFamily: font.bodySemibold, fontSize: 14, lineHeight: 16 },
  notice: { gap: space.xs, padding: space.sm, backgroundColor: "#F3E6D2", borderRadius: radius.sm },

  hero: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.hero,
    overflow: "hidden",
    backgroundColor: "#EFE8DC",
  },
  heroImage: { width: "100%", height: "100%" },
  analyzeBeam: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: color.glow,
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  thumbRow: { flexDirection: "row", gap: space.sm },
  thumbWrap: { flex: 1, gap: 4, alignItems: "center" },
  thumb: { width: "100%", aspectRatio: 3 / 4, borderRadius: radius.sm, backgroundColor: "#EFE8DC" },
  thumbLabel: { fontFamily: font.bodySemibold, fontSize: 12, color: color.bark },
  analyzeStatus: { paddingVertical: space.sm, alignItems: "center" },
  analyzeText: { fontFamily: font.displayItalic, fontSize: 18, color: color.glowDeep },
});
