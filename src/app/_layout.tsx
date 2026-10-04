import { useEffect, useCallback } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import {
  Fraunces_600SemiBold,
  Fraunces_500Medium_Italic,
} from "@expo-google-fonts/fraunces";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";
import { color } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_500Medium_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const onLayout = useCallback(async () => {
    if (fontsLoaded || fontError) await SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayout();
  }, [onLayout]);

  // Dacă fonturile n-au pornit încă, nu randăm nimic (splash rămâne vizibil)
  // — mai bine atât decât un FOUC cu fontul de sistem urmat de un salt vizual.
  // Dacă fontError apare (rar), continuăm oricum cu fallback pe fontul de sistem
  // în loc să blocăm toată aplicația.
  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
