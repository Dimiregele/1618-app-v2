import { Text, StyleSheet } from "react-native";
import { color, font } from "@/theme";

// Semnul φ — singurul element decorativ repetat în toată aplicația, și doar
// atât. Nu e un logo complex, e un glyph tipografic tratat ca parte activă a
// designului (cf. principiul din brief: simbolul poate rămâne chiar dacă
// numele literal "1.618" se schimbă).
export function PhiMark({ size = 32, color: c = color.glow }: { size?: number; color?: string }) {
  return <Text style={[styles.mark, { fontSize: size, color: c }]}>φ</Text>;
}

const styles = StyleSheet.create({
  mark: { fontFamily: font.displayItalic },
});
