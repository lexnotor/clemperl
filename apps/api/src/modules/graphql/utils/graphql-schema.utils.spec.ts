import { buildSchema } from "graphql";
import { printApiSchema } from "./graphql-schema.utils";

describe("printApiSchema", () => {
    it("imprime le schéma trié, après l'en-tête, terminé par un saut de ligne", () => {
        // Déclarés dans le désordre : un fichier dont l'ordre suivrait celui des déclarations
        // changerait au premier résolveur déplacé, sans que le contrat ait bougé.
        const schema = buildSchema("type Zebra { b: Int a: Int } type Query { zebra: Zebra }");

        expect(printApiSchema(schema)).toBe(
            "# Généré par pnpm --filter @clemperl/api schema:print : ne pas modifier à la main.\n" +
                "\n" +
                "type Query {\n  zebra: Zebra\n}\n" +
                "\n" +
                "type Zebra {\n  a: Int\n  b: Int\n}\n",
        );
    });
});
