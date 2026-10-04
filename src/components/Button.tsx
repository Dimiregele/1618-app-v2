import { Pressable, Text, ActivityIndicator, StyleSheet } from "react-native";
import { color, space, radius, font } from "@/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        isDisabled && styles.disabled,
        pressed && !isDisabled && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? color.paper : color.ink} />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: space.sm + 3,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontFamily: font.bodySemibold, fontSize: 16 },
  disabled: { opacity: 0.4 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: color.ink },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: color.ink },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: "transparent", borderWidth: 1, borderColor: color.danger },
});

const labelStyles = StyleSheet.create({
  primary: { color: color.paper },
  secondary: { color: color.ink },
  ghost: { color: color.bark },
  danger: { color: color.danger },
});
