import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Button } from "@/components/Button";
import { color, space, type } from "@/theme";

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
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const router = useRouter();

  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [recommendations, setRecommendations] = useState<RecRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!scanId) return;
    (async () => {
      const [{ data: issuesData }, { data: recsData }] = await Promise.all([
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
      ]);
      setIssues((issuesData as unknown as IssueRow[]) ?? []);
      setRecommendations((recsData as unknown as RecRow[]) ?? []);
      setLoading(false);
    })();
  }, [scanId]);

  if (loading) {
    return (
      <ScreenContainer center>
        <ActivityIndicator color={color.glow} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={type.h1}>Ce am găsit</Text>

      {issues.length === 0 ? (
        <View style={styles.empty}>
          <Text style={type.bodyMuted}>
            Nimic clar vizibil în poza asta. Încearcă o poză cu lumină mai bună, din față, de aproape.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {issues.map((item) => (
            <View key={item.id} style={styles.issueRow}>
              <Text style={type.h2}>{item.category?.display_name?.ro ?? item.issue_slug}</Text>
              <Text style={styles.severity}>{Math.round(item.severity)}</Text>
            </View>
          ))}
        </View>
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
          {recommendations.map((item) => (
            <View key={item.id} style={styles.productRow}>
              <Text style={type.body}>{item.product?.name ?? "Produs"}</Text>
              {item.is_optional && <Text style={type.bodyMuted}>opțional</Text>}
            </View>
          ))}
        </View>
      )}

      <Button label="Continuă către checkout" onPress={() => router.push({ pathname: "/checkout", params: { scanId } })} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { gap: 0 },
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
