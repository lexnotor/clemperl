// Configuration ESLint partagée par les quatre applications et les packages.
// La règle no-restricted-imports fait respecter le sens des dépendances :
// aucun package de bas niveau ne peut remonter vers une application.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
    // Un objet ne portant que `ignores` s'applique à toute la configuration. Sans lui,
    // ESLint analyse les artefacts de build — `.next`, `dist`, le client Prisma — dont
    // le code généré viole des milliers de règles qu'aucune correction ne peut adresser.
    {
        ignores: [
            "**/.next/**",
            "**/dist/**",
            "**/generated/**",
            "**/coverage/**",
            "**/.turbo/**",
            "**/next-env.d.ts",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        // `process`, `console`, `URL`… Sans cette déclaration, la règle `no-undef` les
        // signale comme inconnues dans tout fichier qui tourne sous Node : scripts,
        // seeds, points d'entrée.
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@clemperl/storefront/*", "@clemperl/vendor/*",
                                    "@clemperl/admin/*", "@clemperl/api/*"],
                            message:
                                "Un package ne dépend jamais d'une application. " +
                                "Déplacer le code partagé dans @clemperl/core.",
                        },
                    ],
                },
            ],
        },
    },
);
