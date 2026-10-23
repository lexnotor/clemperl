import { lexicographicSortSchema, printSchema, type GraphQLSchema } from "graphql";

const HEADER =
    "# Généré par pnpm --filter @clemperl/api schema:print : ne pas modifier à la main.\n";

// Le fichier de schéma versionné est cette impression, et rien d'autre. Trié, pour qu'un
// diff ne montre que ce qui a changé dans le contrat ; le saut de ligne final, pour que
// l'éditeur et Git n'y voient pas un fichier tronqué.
export function printApiSchema(schema: GraphQLSchema): string {
    return `${HEADER}\n${printSchema(lexicographicSortSchema(schema))}\n`;
}
