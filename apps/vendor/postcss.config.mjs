// Tailwind 4 se branche par ce greffon PostCSS. Sans lui, la directive `@theme` de
// `@clemperl/ui` traverse le build sans être traitée : aucune classe utilitaire n'est
// générée, et l'application s'affiche sans aucun style — sans que le build échoue.
const config = { plugins: { "@tailwindcss/postcss": {} } };

export default config;
