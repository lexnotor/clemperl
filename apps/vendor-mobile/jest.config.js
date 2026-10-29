// Le préréglage d'Expo, et deux ajouts, tous deux pour le client de Better Auth.
//
// Le préréglage ne transforme, dans `node_modules`, que React Native et Expo, et laisse les
// autres paquets tels quels. Le client de Better Auth et ses dépendances sont publiés en ESM,
// que Jest ne sait pas charger sans transformation : ils rejoignent la liste, reprise du
// préréglage, `.pnpm` compris. Et une partie de ces fichiers finit en `.mjs`, une extension que
// la table de transformation du préréglage ne couvre pas : elle reçoit le même transformateur
// que `.js`.
// Jest lit ce fichier en CommonJS, et le préréglage n'existe qu'en CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require("jest-expo/jest-preset");

const ESM_PACKAGES = [
    "better-auth",
    "@better-auth",
    "@better-fetch",
    "better-call",
    "nanostores",
    "@nanostores",
    "jose",
    "@noble",
    "defu",
    "rou3",
    "uncrypto",
];

module.exports = {
    preset: "jest-expo",
    testMatch: ["<rootDir>/src/**/*.spec.ts", "<rootDir>/src/**/*.spec.tsx"],
    transform: { ...preset.transform, "\\.mjs$": preset.transform["\\.[jt]sx?$"] },
    transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
        pattern.startsWith("/node_modules/(?!(")
            ? pattern.replace("/node_modules/(?!(", `/node_modules/(?!(${ESM_PACKAGES.join("|")}|`)
            : pattern,
    ),
};
