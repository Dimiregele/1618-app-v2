import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { supabase } from "@/lib/supabase";
import type { Guide } from "@/types/database";
import { ScreenContainer } from "@/components/ScreenContainer";
import { color, space, radius, type } from "@/theme";

export default function Guides() {
  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("guides")
        .select("*")
        .eq("user_id", user.id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setGuide(data);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <ScreenContainer center>
        <ActivityIndicator color={color.glow} />
      </ScreenContainer>
    );
  }

  if (!guide) {
    return (
      <ScreenContainer center>
        <Text style={[type.bodyMuted, { textAlign: "center" }]}>
          Ghidurile apar aici după prima achiziție. Generarea lor efectivă (din scan + chestionar)
          e un pas următor — nu e construită încă.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Text style={type.h1}>Ghid de utilizare</Text>
      <View style={styles.block}>
        <Text style={styles.mono}>{JSON.stringify(guide.usage_guide, null, 2)}</Text>
      </View>

      <Text style={type.h1}>Plan de alimentație</Text>
      <View style={styles.block}>
        <Text style={styles.mono}>{JSON.stringify(guide.nutrition_plan, null, 2)}</Text>
      </View>

      <Text style={type.h1}>Plan de antrenament</Text>
      <View style={styles.block}>
        <Text style={styles.mono}>{JSON.stringify(guide.training_plan, null, 2)}</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: "#FFFFFF", borderRadius: radius.sm, padding: space.sm, borderWidth: 1, borderColor: color.line },
  mono: { fontFamily: "Inter_400Regular", fontSize: 13, color: color.bark },
});
