import { useState } from "react";
import { View, Text, Alert, StyleSheet } from "react-native";
import { Link, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ScreenContainer } from "@/components/ScreenContainer";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { PhiMark } from "@/components/PhiMark";
import { space, type } from "@/theme";

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error || !data.user) {
      Alert.alert("Nu am reușit să creăm contul", error?.message ?? "Eroare necunoscută");
      return;
    }
    // Rândul din `profiles` se creează automat printr-un trigger Postgres pe
    // auth.users (migrarea auto_create_profile_on_signup) — nu inserăm manual aici.
    router.replace("/(onboarding)/scan");
  }

  return (
    <ScreenContainer center>
      <View style={styles.brand}>
        <PhiMark size={40} />
        <Text style={type.h1}>Creează cont</Text>
      </View>

      <View style={{ gap: space.sm }}>
        <TextField
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextField label="Parolă" secureTextEntry value={password} onChangeText={setPassword} />
      </View>

      <Button label={loading ? "..." : "Creează cont"} onPress={handleSignup} loading={loading} />

      <Link href="/(auth)/login" style={styles.link}>
        <Text style={type.bodyMuted}>Ai deja cont? Intră</Text>
      </Link>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", gap: space.xs, marginBottom: space.sm },
  link: { alignSelf: "center", marginTop: space.xs },
});
