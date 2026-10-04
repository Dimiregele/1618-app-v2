import { View, Text, StyleSheet } from "react-native";
import { color, space, font } from "@/theme";

// Folosit DOAR pt. fluxul de onboarding (scanare → chestionar → rezultate →
// checkout), pentru că e genuinely o secvență cu pași — nu un marcator
// numerotat pus decorativ unde conținutul nu e de fapt o succesiune.
export function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.text}>
        Pasul {step} din {total}
      </Text>
      <View style={styles.track}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={[styles.segment, i < step && styles.segmentActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.xs },
  text: { fontFamily: font.bodySemibold, fontSize: 13, color: color.bark },
  track: { flexDirection: "row", gap: space.xs / 2 },
  segment: { flex: 1, height: 3, backgroundColor: color.line, borderRadius: 2 },
  segmentActive: { backgroundColor: color.glow },
});
