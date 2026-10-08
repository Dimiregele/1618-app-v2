import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { speak, stopSpeaking } from "@/lib/voice";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Button } from "@/components/Button";
import { Assistant } from "@/components/Assistant";
import { lifestyleInsights, type Insight, type Profile } from "@/lib/profile";
import { color, font, radius, space, type } from "@/theme";

// Ce îi spunem utilizatorului când modelul a semnalat o problemă tehnică a pozei (în loc de un „nimic găsit” înșelător).
const QUALITY_TEXT: Record<string, string> = {
  prea_intunecat: "Poza a ieșit prea întunecată, deci nu putem judeca bine pielea. Repetă scanarea lângă o fereastră sau o lumină albă, cu fața spre ea.",
  prea_luminos: "Poza a ieșit prea luminoasă, iar detaliile pielii s-au pierdut. Repetă scanarea la o lumină mai blândă, fără bătaie directă.",
  fata_prea_aproape: "Fața a fost prea aproape de cameră. Repetă scanarea ținând camera la lungimea brațului.",
  fata_prea_departe: "Fața a fost prea departe de cameră. Repetă scanarea mai aproape, cu fața în oval.",
  fata_neclara: "Poza a ieșit neclară sau mișcată. Repetă scanarea stând nemișcat câteva secunde.",
  unclear: "Calitatea pozei nu a permis o analiză sigură. Repetă scanarea cu lumină bună, din față, la lungimea brațului.",
};

type IssueRow = {
  id: string;
  issue_slug: string;
  severity: number;
  category: { display_name: Record<string, string> } | null;
};
type RecRow = {
  id: string;
  is_optional: boolean;
  product: { name: string } | null;
};

export default function Results() {
  const { scanId, quality } = useLocalSearchParams<{ scanId: string; quality?: string }>();
  const router = useRouter();

  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecRow[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!scanId) return;
    (async () => {
      const [{ data: issuesData }, { data: recsData }, { data: qData }] = await Promise.all([
        supabase
          .from("scan_issues")
          .select("id, issue_slug, severity, category:issue_categories(display_name)")
          .eq("scan_id", scanId)
          .order("severity", { ascending: false }),
        supabase
          .from("recommendations")
          .select("id, is_optional, product:products(name)")
          .eq("scan_id", scanId)
          .order("priority", { ascending: true }),
        supabase
          .from("questionnaire_responses")
          .select("answers")
          .eq("scan_id", scanId)
          .order("created_at", { ascending: false })
          .limit(1),
      ]);
      const derived = (qData as unknown as { answers?: { derived?: Profile } }[] | null)?.[0]?.answers?.derived;
      const loadedInsights = derived ? lifestyleInsights(derived) : [];
      setInsights(loadedInsights);
      const loadedIssues = (issuesData as unknown as IssueRow[]) ?? [];
      setIssues(loadedIssues);
      setRecommendations((recsData as unknown as RecRow[]) ?? []);
      setLoading(false);

      const names = loadedIssues.map((i) => i.category?.display_name?.ro ?? i.issue_slug);
      const qualityText = quality ? (QUALITY_TEXT[quality] ?? QUALITY_TEXT.unclear) : null;
      if (names.length === 0) {
        speak(qualityText ?? "Nu am văzut semne clare de probleme în scanare. Pielea arată bine pe ce se vede în poze.");
      } else {
        // conține rezultatele persoanei: doar vocea dispozitivului, nimic trimis la server
        speak(
          `Am găsit ${names.length} ${names.length === 1 ? "zonă de îmbunătățit" : "zone de îmbunătățit"}: ${names.join(", ")}. Mai jos vezi produsele recomandate pentru fiecare.`,
          { local: true },
        );
      }
    })();
    return () => stopSpeaking();
  }, [scanId, quality]);

  if (loading) {
    return (
      <ScreenContainer center>
        <ActivityIndicator color={color.glow} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Assistant size={52} idleHint="Atinge-mă ca să repet" />
      <Text style={type.h1}>Ce am găsit</Text>

      {quality && (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>Calitatea pozei a limitat analiza</Text>
          <Text style={type.bodyMuted}>{QUALITY_TEXT[quality] ?? QUALITY_TEXT.unclear}</Text>
          <Button label="Repet scanarea" variant="secondary" onPress={() => router.replace("/(onboarding)/scan")} />
        </View>
      )}

      {issues.length === 0 ? (
        <View style={styles.empty}>
          <Text style={type.bodyMuted}>
            {quality
              ? "Nu putem spune că pielea ta nu are probleme: poza nu a fost suficient de bună ca să le vedem."
              : "Nu am văzut semne clare de probleme în scanare. Pielea arată bine pe ce se vede în poze. Recomandările de mai jos țin cont și de răspunsurile tale."}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {issues.map((item, i) => (
            <Animated.View key={item.id} entering={FadeInDown.delay(i * 90).duration(380)} style={styles.issueRow}>
              <Text style={type.h2}>{item.category?.display_name?.ro ?? item.issue_slug}</Text>
              <Text style={styles.severity}>{Math.round(item.severity)}</Text>
            </Animated.View>
          ))}
        </View>
      )}

      {insights.length > 0 && (
        <>
          <Text style={[type.h1, { marginTop: space.md }]}>Ce mai influențează pielea ta</Text>
          <Text style={type.bodyMuted}>
            Estimări orientative din răspunsurile tale, nu diagnostice medicale.
          </Text>
          <View style={styles.list}>
            {insights.map((ins, i) => (
              <Animated.View
                key={ins.id}
                entering={FadeInDown.delay(200 + i * 80).duration(360)}
                style={[styles.insight, ins.tone === "watch" && styles.insightWatch]}
              >
                <Text style={type.h2}>{ins.title}</Text>
                <Text style={type.bodyMuted}>{ins.detail}</Text>
              </Animated.View>
            ))}
          </View>
        </>
      )}

      <Text style={[type.h1, { marginTop: space.md }]}>Produse recomandate</Text>
      {recommendations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={type.bodyMuted}>
            Încă nu avem recomandări de produse pentru profilul tău — motorul de recomandare urmează.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {recommendations.map((item, i) => (
            <Animated.View key={item.id} entering={FadeInDown.delay(300 + i * 90).duration(380)} style={styles.productRow}>
              <Text style={type.body}>{item.product?.name ?? "Produs"}</Text>
              {item.is_optional && <Text style={type.bodyMuted}>opțional</Text>}
            </Animated.View>
          ))}
        </View>
      )}

      <Button label="Continuă către checkout" onPress={() => router.push({ pathname: "/checkout", params: { scanId } })} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
  warn: { gap: space.xs, padding: space.md, backgroundColor: "#F3E6D2", borderRadius: radius.sm },
  warnTitle: { fontFamily: font.bodySemibold, fontSize: 15, color: color.glowDeep },
  insight: { gap: 4, paddingVertical: space.sm, paddingLeft: space.sm, borderLeftWidth: 3, borderColor: color.line, marginBottom: space.xs },
  insightWatch: { borderColor: color.glow },
  empty: { paddingVertical: space.sm },
  issueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderColor: color.line,
  },
  severity: { fontFamily: "Fraunces_600SemiBold", fontSize: 28, color: color.glow },
  productRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderColor: color.line,
  },
});
