import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function Index() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // TODO: când avem `scans` reale, verifică dacă userul are deja o scanare
  // completă și trimite-l direct în (tabs)/home în loc de scan.
  return <Redirect href={hasSession ? "/(onboarding)/scan" : "/(auth)/login"} />;
}
