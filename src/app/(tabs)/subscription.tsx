import { useEffect, useState } from "react";
import { View, Text, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { supabase } from "@/lib/supabase";
import type { Subscription } from "@/types/database";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Button } from "@/components/Button";
import { color, space, type } from "@/theme";

export default function SubscriptionScreen() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadSubscription() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSubscription(data);
    setLoading(false);
  }

  useEffect(() => {
    loadSubscription();
  }, []);

  async function handleCancel() {
    if (!subscription) return;
    Alert.alert(
      "Anulezi abonamentul?",
      "Anularea se procesează acum, dar intră în vigoare la finalul angajamentului minim de 3 luni, conform legii.",
      [
        { text: "Renunț", style: "cancel" },
        {
          text: "Da, anulează",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("subscriptions")
              .update({ cancel_requested_at: new Date().toISOString() })
              .eq("id", subscription.id);
            if (error) {
              Alert.alert("Nu am reușit să procesăm anularea", error.message);
              return;
            }
            loadSubscription();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <ScreenContainer center>
        <ActivityIndicator color={color.glow} />
      </ScreenContainer>
    );
  }

  if (!subscription) {
    return (
      <ScreenContainer center>
        <Text style={type.bodyMuted}>Nu ai un abonament activ.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer center>
      <Text style={styles.tier}>{subscription.tier.toUpperCase()}</Text>
      <Text style={type.bodyMuted}>Status: {subscription.status}</Text>
      <Text style={[type.bodyMuted, { marginBottom: space.md }]}>
        Cicluri de facturare finalizate: {subscription.cycles_completed} / {subscription.commitment_min_cycles} minim
      </Text>

      {subscription.cancel_requested_at ? (
        <Text style={[type.bodyMuted, { fontStyle: "italic" }]}>
          Anulare în curs — activă până la {subscription.cancel_effective_at ?? "finalul angajamentului minim"}.
        </Text>
      ) : (
        <Button label="Anulează abonamentul" onPress={handleCancel} variant="danger" />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tier: { fontFamily: "Fraunces_600SemiBold", fontSize: 32, color: color.ink },
});
