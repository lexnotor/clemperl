import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { auth } from "@clemperl/auth";
import { prisma } from "@clemperl/db";
import { AppModule } from "../src/app.module";

const PASSWORD = "motdepasse123";

// Le chemin du téléphone, refait à l'identique côté serveur. Le client Expo de Better Auth
// n'envoie pas d'`Origin` : il annonce la sienne dans `expo-origin`, que le plugin `expo()`
// recopie en `Origin` avant le contrôle des origines de confiance. La connexion passe donc par
// `auth.handler`, la route HTTP même que le téléphone appelle, et non par `auth.api`, qui
// ignorerait ces en-têtes.
function signInFromPhone(email: string, expoOrigin: string): Promise<Response> {
    const storefront = process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "";
    return auth.handler(
        new Request(`${storefront}/api/auth/sign-in/email`, {
            method: "POST",
            headers: { "content-type": "application/json", "expo-origin": expoOrigin },
            body: JSON.stringify({ email, password: PASSWORD }),
        }),
    );
}

describe("la session du téléphone", () => {
    let app: INestApplication;
    const email = `mobile-${Date.now()}@exemple.test`;

    beforeAll(async () => {
        await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Essai" } });
        await prisma.user.update({ where: { email }, data: { emailVerified: true } });
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = module.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        await prisma.user.deleteMany({ where: { email } });
        await prisma.$disconnect();
    });

    it("connecte le téléphone dans Expo Go", async () => {
        const response = await signInFromPhone(email, "exp://192.0.2.20:8081");

        expect(response.status).toBe(200);
        expect(response.headers.get("set-cookie")).toContain("session_token");
    });

    it("connecte l'application sous son propre schéma", async () => {
        const response = await signInFromPhone(email, "clemperl-vendor://");

        expect(response.status).toBe(200);
    });

    // Sans ce refus, n'importe quel client pourrait se dire « l'application » : le plugin
    // n'apporte rien s'il ne compare pas `expo-origin` aux origines de confiance.
    it("refuse une origine Expo inconnue", async () => {
        const response = await signInFromPhone(email, "https://ailleurs.test");

        expect(response.status).toBe(403);
    });

    it("ouvre /graphql au cookie que le téléphone a reçu", async () => {
        const signIn = await signInFromPhone(email, "exp://192.0.2.20:8081");
        const [cookie = ""] = (signIn.headers.get("set-cookie") ?? "").split(";");

        // Sans `Origin`, comme `fetch` en React Native.
        const response = await request(app.getHttpServer())
            .post("/graphql")
            .set("Content-Type", "application/json")
            .set("Cookie", cookie)
            .send({ query: "{ me { user { email } } }" })
            .expect(200);

        expect(response.body.data.me.user.email).toBe(email);
    });
});
