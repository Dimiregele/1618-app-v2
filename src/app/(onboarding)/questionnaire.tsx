import { useState } from "react";
import { View, Text, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { ScreenContainer } from "@/components/ScreenContainer";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { StepIndicator } from "@/components/StepIndicator";
import { space, type } from "@/theme";

export default function Questionnaire() {
  const router = useRouter();
  const { scanId } = useLocalSearchParams<{ scanId: string }>();

  const [sleepHours, setSleepHours] = useState("");
  const [exerciseFrequency, setExerciseFrequency] = useState("");
  const [gymAccess, setGymAccess] = useState("");
  const [dietNotes, setDietNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!scanId) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      Alert.alert("Sesiune expirată", "Te rugăm să te autentifici din nou.");
      router.replace("/(auth)/login");
      return;
    }
    const { error } = await supabase.from("questionnaire_responses").insert({
      user_id: user.id,
      scan_id: scanId,
      answers: {
        sleep_hours_per_night: Number(sleepHours) || null,
        exercise_frequency_per_week: Number(exerciseFrequency) || null,
        gym_access: gymAccess || null,
        diet_notes: dietNotes || null,
      },
    });
    setSaving(false);
    if (error) {
      Alert.alert("Nu am reușit să salvăm răspunsurile", error.message);
      return;
    }
    router.push({ pathname: "/results", params: { scanId } });
  }

  return (
    <ScreenContainer>
      <StepIndicator step={2} total={4} />
      <Text style={type.h1}>Câteva întrebări despre stilul tău de viață</Text>

      <View style={{ gap: space.sm }}>
        <TextField
          label="Câte ore dormi în medie pe noapte?"
          keyboardType="numeric"
          value={sleepHours}
          onChangeText={setSleepHours}
          placeholder="ex: 7"
        />
        <TextField
          label="De câte ori pe săptămână faci mișcare?"
          keyboardType="numeric"
          value={exerciseFrequency}
          onChangeText={setExerciseFrequency}
          placeholder="ex: 3"
        />
        <TextField
          label="Ai acces la sală?"
          value={gymAccess}
          onChangeText={setGymAccess}
          placeholder="da / nu / doar acasă"
        />
        <TextField
          label="Cum arată alimentația ta, pe scurt?"
          multiline
          style={{ height: 90, textAlignVertical: "top" }}
          value={dietNotes}
          onChangeText={setDietNotes}
          placeholder="ex: sar peste micul dejun, mănânc des la restaurant..."
        />
      </View>

      <Button label={saving ? "..." : "Vezi rezultatele"} onPress={handleSubmit} loading={saving} />
    </ScreenContainer>
  );
}
