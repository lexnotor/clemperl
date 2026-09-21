import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { auth } from "@clemperl/auth";
import { prisma } from "@clemperl/db";
import { AppModule } from "../src/app.module";

const motDePasse = "motdepasse123";

// Ouvre une vraie session et rend son cookie. Fabriquer un jeton à la main ne
// prouverait rien : ce qu'on veut vérifier, c'est que l'API reconnaît le cookie que
// Better Auth émet réellement, avec la signature et le format qu'il lui donne.
async function ouvrirSession(adresse: string): Promise<string> {
    await auth.api.signUpEmail({ body: { email: adresse, password: motDePasse, name: "Essai" } });
    // La vérification de l'adresse est obligatoire : sans ce passage, la connexion
    // renvoie 403 et le test mesurerait la mauvaise chose.
    await prisma.user.update({ where: { email: adresse }, data: { emailVerified: true } });

    const reponse = await auth.api.signInEmail({
        body: { email: adresse, password: motDePasse },
        asResponse: true,
    });
    const cookie = reponse.headers.get("set-cookie");
    if (!cookie) {
        throw new Error("la connexion n'a produit aucun cookie de session");
    }
    // Seul le premier segment porte le couple nom=valeur ; le reste (`Path`, `HttpOnly`,
    // `SameSite`) n'a pas sa place dans un en-tête `Cookie` de requête.
    const [couple = cookie] = cookie.split(";");
    return couple;
}

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
            .set("Cookie", await ouvrirSession(adresse))
            .expect(200);

        expect(reponse.body.email).toBe(adresse);
        // La réponse ne doit rien porter d'autre : un `session.user` renvoyé tel quel
        // exposerait des champs que le client n'a pas à connaître.
        expect(Object.keys(reponse.body).sort()).toEqual(["email", "id"]);
    });
});
