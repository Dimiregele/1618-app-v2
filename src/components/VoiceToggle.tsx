import { Pressable, Text, StyleSheet } from "react-native";
import { color, space, font } from "@/theme";
import { useVoiceEnabled } from "@/lib/voice";

// Comutator pentru asistentul vocal. Apare pe ecranele ghidate (chestionar, scanare).
export function VoiceToggle({ dark = false }: { dark?: boolean }) {
  const [enabled, setEnabled] = useVoiceEnabled();
  const fg = dark ? color.paper : color.ink;
  return (
    <Pressable
      onPress={() => setEnabled(!enabled)}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel="Asistent vocal"
      hitSlop={8}
      style={[styles.pill, { borderColor: dark ? "rgba(250,246,240,0.35)" : color.line }]}
    >
      <Text style={[styles.dot, { color: enabled ? color.glow : color.bark }]}>●</Text>
      <Text style={[styles.label, { color: fg }]}>{enabled ? "Voce pornită" : "Voce oprită"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs - 2,
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  dot: { fontSize: 10 },
  label: { fontFamily: font.bodySemibold, fontSize: 13 },
});
