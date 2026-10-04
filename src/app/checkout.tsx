import { useState } from "react";
import { View, Text, Pressable, Alert, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Button } from "@/components/Button";
import { StepIndicator } from "@/components/StepIndicator";
import { color, space, radius, type } from "@/theme";

type Option = "one_time" | "subscription";

export default function Checkout() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const [selected, setSelected] = useState<Option>("subscription");

  function handleConfirm() {
    // TODO: Edge Function care creează sesiunea de checkout Stripe.
    Alert.alert(
      "Checkout (placeholder)",
      `scanId: ${scanId}\nOpțiune: ${selected}\n\nUrmează integrarea reală cu Stripe.`
    );
  }

  return (
    <ScreenContainer>
      <StepIndicator step={4} total={4} />
      <Text style={type.h1}>Alege cum vrei să continui</Text>

      <Pressable
        style={[styles.card, selected === "one_time" && styles.cardSelected]}
        onPress={() => setSelected("one_time")}
      >
        <Text style={type.h2}>Plată unică</Text>
        <Text style={styles.price}>289 €</Text>
        <Text style={type.bodyMuted}>O singură dată. Fără reînnoire automată.</Text>
      </Pressable>

      <Pressable
        style={[styles.card, selected === "subscription" && styles.cardSelected]}
        onPress={() => setSelected("subscription")}
      >
        <Text style={type.h2}>Abonament</Text>
        <Text style={styles.price}>39 € / lună</Text>
        <Text style={type.bodyMuted}>
          Angajament minim 3 luni. Poți apăsa „anulează” oricând — anularea intră în vigoare după
          cele 3 cicluri minime, conform legii UE.
        </Text>
      </Pressable>

      <Text style={type.bodyMuted}>
        Indiferent de opțiune primești: ghid de utilizare + plan de alimentație + plan de
        antrenament, generate din scanarea ta.
      </Text>

      <Button label="Continuă" onPress={handleConfirm} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: color.line, borderRadius: radius.hero, padding: space.md, gap: space.xs / 2 },
  cardSelected: { borderColor: color.glow, borderWidth: 2 },
  price: { fontFamily: "Fraunces_600SemiBold", fontSize: 28, color: color.ink },
});
