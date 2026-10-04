import { useState } from "react";
import { View, Text, Image, Alert, StyleSheet, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { runScan } from "@/lib/faceScan";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Button } from "@/components/Button";
import { StepIndicator } from "@/components/StepIndicator";
import { color, space, radius, type } from "@/theme";

export default function ScanScreen() {
  const router = useRouter();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function takePhoto() {
    try {
      if (Platform.OS === "web") {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.9,
        });
        if (!result.canceled) setPhotoUri(result.assets[0].uri);
        return;
      }
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Avem nevoie de acces la cameră pentru scanare.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        quality: 0.9,
        allowsEditing: false,
      });
      if (!result.canceled) setPhotoUri(result.assets[0].uri);
    } catch (err) {
      Alert.alert("Nu am putut deschide camera/galeria", err instanceof Error ? err.message : String(err));
    }
  }

  async function analyzeAndContinue() {
    if (!photoUri) return;
    setAnalyzing(true);
    try {
      const { scanId } = await runScan(photoUri);
      router.push({ pathname: "/(onboarding)/questionnaire", params: { scanId } });
    } catch (err) {
      Alert.alert("Scanarea a eșuat", err instanceof Error ? err.message : "Eroare necunoscută");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <ScreenContainer>
      <StepIndicator step={1} total={4} />

      <View style={{ gap: space.xs }}>
        <Text style={type.h1}>Scanare facială</Text>
        <Text style={type.bodyMuted}>
          O singură scanare identifică toate problemele relevante — nu trecem secvențial prin ele.
        </Text>
      </View>

      {Platform.OS === "web" && (
        <View style={styles.webNote}>
          <Text style={[type.bodyMuted, { color: color.glowDeep }]}>
            Rulezi în browser — nu există acces la cameră aici, doar încărcare de fișier.
          </Text>
        </View>
      )}

      {photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.preview} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={type.bodyMuted}>Nicio poză încă</Text>
        </View>
      )}

      <Button
        label={photoUri ? "Repetă poza" : Platform.OS === "web" ? "Alege o poză" : "Deschide camera"}
        onPress={takePhoto}
        variant="secondary"
        disabled={analyzing}
      />
      <Button label="Analizează" onPress={analyzeAndContinue} disabled={!photoUri} loading={analyzing} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  webNote: { backgroundColor: "#F3E6D2", padding: space.sm, borderRadius: radius.sm },
  preview: { width: "100%", aspectRatio: 3 / 4, borderRadius: radius.hero, backgroundColor: "#EFE8DC" },
  placeholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.hero,
    backgroundColor: "#EFE8DC",
    alignItems: "center",
    justifyContent: "center",
  },
});
