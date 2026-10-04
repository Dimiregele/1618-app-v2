import { View, Text } from "react-native";
import { ScreenContainer } from "@/components/ScreenContainer";
import { PhiMark } from "@/components/PhiMark";
import { space, type } from "@/theme";

export default function Home() {
  return (
    <ScreenContainer center>
      <View style={{ alignItems: "center", gap: space.sm }}>
        <PhiMark size={40} />
        <Text style={type.h1}>Bine ai venit înapoi</Text>
        <Text style={[type.bodyMuted, { textAlign: "center" }]}>
          Aici o să apară statusul planului tău curent și progresul către rescanarea de la 3 luni.
        </Text>
      </View>
    </ScreenContainer>
  );
}
