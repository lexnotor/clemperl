import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { GraphQLSchemaHost } from "@nestjs/graphql";
import { prisma } from "@clemperl/db";
import { AppModule } from "../src/app.module";
import { printApiSchema } from "../src/modules/graphql/utils";

const SCHEMA_FILE = join(__dirname, "../src/modules/graphql/schema.gql");

// Le schéma est imprimé depuis l'application ENTIÈRE, et non depuis une liste de
// résolveurs : un résolveur ajouté à un module et oublié d'une liste ne manquerait pas au
// fichier sans que personne ne le voie.
//
// Le même test écrit le fichier quand `UPDATE_SCHEMA` vaut 1, ce que fait `schema:print`, et
// le compare sinon. Un seul `it` dans les deux cas : Jest refuse un fichier sans test.
describe("le schéma GraphQL versionné", () => {
    let app: INestApplication;

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = module.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        await prisma.$disconnect();
    });

    it("le fichier de schéma versionné est celui que le code produit", () => {
        const printed = printApiSchema(app.get(GraphQLSchemaHost).schema);

        if (process.env["UPDATE_SCHEMA"] === "1") {
            writeFileSync(SCHEMA_FILE, printed);
            return;
        }

        let committed = "";
        try {
            committed = readFileSync(SCHEMA_FILE, "utf8");
        } catch {
            // Absent : la comparaison qui suit échoue avec le même message qu'un écart.
        }
        if (committed !== printed) {
            throw new Error(
                "schema.gql ne correspond plus au code. Lancer " +
                    "pnpm --filter @clemperl/api schema:print, puis relire le changement de " +
                    "contrat avant de le commiter.",
            );
        }
    });
});
