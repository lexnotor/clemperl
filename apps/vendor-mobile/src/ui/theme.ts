// Les couleurs de ClemPerl, celles de `packages/ui/src/styles/globals.css`, converties en
// hexadécimal : React Native ne lit pas `oklch`. La valeur d'origine suit chaque couleur
// convertie.
export interface ITheme {
    background: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
}

export const lightTheme: ITheme = {
    background: "#ffffff",
    text: "#000000",
    muted: "#5d5d5d", // oklch(48% 0 0)
    border: "#d4d4d4", // oklch(87% 0 0)
    accent: "#c50220", // oklch(52% 0.21 25)
};

export const darkTheme: ITheme = {
    background: "#0d0d0d", // oklch(16% 0 0)
    text: "#f5f5f5", // oklch(97% 0 0)
    muted: "#9e9e9e", // oklch(70% 0 0)
    border: "#333333", // oklch(32% 0 0)
    accent: "#f66d67", // oklch(70% 0.17 25)
};
