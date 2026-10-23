import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@clemperl/db";
import { AppModule } from "../src/app.module";
import { openSession } from "./helpers/open-session";

describe("GET /me", () => {
    let app: INestApplication;
    const adresse = `api-${Date.now()}@exemple.test`;

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = module.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        await prisma.user.deleteMany({ where: { email: adresse } });
        await prisma.$disconnect();
    });

    it("refuse une requête sans session", async () => {
        await request(app.getHttpServer()).get("/me").expect(401);
    });

    it("refuse un cookie de session fabriqué", async () => {
        // Ce test compte autant que le précédent : un garde qui accepterait n'importe
        // quel cookie passerait le premier sans rien protéger.
        await request(app.getHttpServer())
            .get("/me")
            .set("Cookie", "better-auth.session_token=invente")
            .expect(401);
    });

    it("accepte une session valide et n'expose que l'identité", async () => {
        // L'autre moitié du critère : un garde qui refuserait tout passerait les deux
        // tests précédents sans laisser personne entrer.
        const reponse = await request(app.getHttpServer())
            .get("/me")
            .set("Cookie", await openSession(adresse))
            .expect(200);

        expect(reponse.body.email).toBe(adresse);
        // La réponse ne doit rien porter d'autre : un `session.user` renvoyé tel quel
        // exposerait des champs que le client n'a pas à connaître.
        expect(Object.keys(reponse.body).sort()).toEqual(["email", "id"]);
    });
});
