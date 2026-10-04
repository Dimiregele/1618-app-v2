import { ScrollView, View, StyleSheet, ViewStyle } from "react-native";
import { color, space } from "@/theme";

// Fiecare ecran trece prin asta — evită bug-ul pe care l-am avut pe web
// (lățime 100% + aspectRatio fără scroll = conținut tăiat pe ecran lat) și
// ține totul centrat, cu lățime maximă, indiferent de platformă.
export function ScreenContainer({
  children,
  center = false,
  style,
}: {
  children: React.ReactNode;
  center?: boolean;
  style?: ViewStyle;
}) {
  return (
    <ScrollView
      style={{ backgroundColor: color.paper }}
      contentContainerStyle={[styles.scroll, center && styles.center]}
    >
      <View style={[styles.inner, style]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: space.lg },
  center: { justifyContent: "center" },
  inner: { width: "100%", maxWidth: 440, alignSelf: "center", gap: space.md },
});
