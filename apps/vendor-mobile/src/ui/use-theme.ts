import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, type ITheme } from "./theme";

// Le thème suit le réglage clair ou sombre du téléphone, comme le web suit celui du système.
export function useTheme(): ITheme {
    return useColorScheme() === "dark" ? darkTheme : lightTheme;
}
