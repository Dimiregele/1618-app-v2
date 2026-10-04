import { Tabs } from "expo-router";
import { color, font } from "@/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.glowDeep,
        tabBarInactiveTintColor: color.bark,
        tabBarStyle: { backgroundColor: color.paper, borderTopColor: color.line },
        tabBarLabelStyle: { fontFamily: font.bodyMedium, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Acasă" }} />
      <Tabs.Screen name="guides" options={{ title: "Ghiduri" }} />
      <Tabs.Screen name="subscription" options={{ title: "Abonament" }} />
    </Tabs>
  );
}
