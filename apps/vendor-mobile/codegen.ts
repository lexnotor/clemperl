import type { CodegenConfig } from "@graphql-codegen/cli";

// Les types du téléphone, tirés du contrat de l'API : le fichier de schéma que T8a imprime et
// versionne. Les documents sont les requêtes écrites dans `src/` par `graphql()` ; les tests en
// sont exclus, pour que leurs requêtes de démonstration ne deviennent pas des types.
const config: CodegenConfig = {
    schema: "../api/src/modules/graphql/schema.gql",
    documents: ["src/**/*.{ts,tsx}", "!src/**/*.spec.{ts,tsx}", "!src/graphql/generated/**"],
    ignoreNoDocuments: true,
    generates: {
        "src/graphql/generated/": {
            preset: "client",
            config: { useTypeImports: true },
        },
    },
};

export default config;
