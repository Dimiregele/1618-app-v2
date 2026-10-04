import { useState } from "react";
import { View, Text, Alert, StyleSheet } from "react-native";
import { Link, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ScreenContainer } from "@/components/ScreenContainer";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { PhiMark } from "@/components/PhiMark";
import { color, space, type } from "@/theme";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert("Nu am reușit să te autentificăm", error.message);
      return;
    }
    router.replace("/(onboarding)/scan");
  }

  return (
    <ScreenContainer center>
      <View style={styles.brand}>
        <PhiMark size={40} />
        <Text style={type.h1}>Bine ai revenit</Text>
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

      <Button label={loading ? "..." : "Intră în cont"} onPress={handleLogin} loading={loading} />

      <Link href="/(auth)/signup" style={styles.link}>
        <Text style={type.bodyMuted}>Nu ai cont? Creează unul</Text>
      </Link>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", gap: space.xs, marginBottom: space.sm },
  link: { alignSelf: "center", marginTop: space.xs },
});
