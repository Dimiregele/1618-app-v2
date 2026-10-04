import { TextInput, View, Text, StyleSheet, TextInputProps } from "react-native";
import { color, space, font } from "@/theme";

export function TextField({ label, style, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: space.xs / 2 }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={color.bark}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: font.bodySemibold, fontSize: 13, color: color.bark },
  input: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 4,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm + 2,
    fontFamily: font.body,
    fontSize: 16,
    color: color.ink,
    backgroundColor: "#FFFFFF",
  },
});
