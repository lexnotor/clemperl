// Les parcours Playwright vivent à la racine, hors de tout package : `turbo run lint`,
// qui parcourt les packages, ne les voit pas. Cette configuration les rattache aux
// mêmes règles que le reste du dépôt.
import config from "@clemperl/eslint-config";

export default [
    { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**", "test-results/**"] },
    ...config,
];
