import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@clemperl/db";
import { AppModule } from "../src/app.module";
import { openSession } from "./helpers/open-session";

const ME = "{ me { user { email } shop { name slug suspended } } }";
const PREFIX = `gql-${Date.now()}`;

// Une boutique complète, au modèle de `createShop` dans `realtime.int-spec.ts`.
async function createShop(label: string) {
    return prisma.vendor.create({
        data: {
            slug: `${PREFIX}-${label}`,
            shopName: `Atelier ${label}`,
            shopDescription: "Joaillerie artisanale, pièces uniques montées à la main.",
            contactEmail: `contact-${label}@atelier.test`,
            contactPhone: "+32470000000",
            categories: ["JEWELLERY"],
            legalForm: "SRL",
            legalName: `Atelier ${label} SRL`,
            registrationNumber: "0123456789",
            country: "BE",
            currency: "EUR",
        },
    });
}

describe("POST /graphql", () => {
    let app: INestApplication;
    const emails: string[] = [];
    const shopIds: string[] = [];

    // Un compte neuf par cas : une boutique attachée à l'un ne doit pas se voir chez l'autre.
    async function account(
        label: string,
    ): Promise<{ cookie: string; userId: string; email: string }> {
        const email = `${PREFIX}-${label}@exemple.test`;
        emails.push(email);
        const cookie = await openSession(email);
        const { id } = await prisma.user.findUniqueOrThrow({ where: { email } });
        return { cookie, userId: id, email };
    }

    async function memberOf(userId: string, label: string) {
        const shop = await createShop(label);
        shopIds.push(shop.id);
        await prisma.vendorMember.create({ data: { vendorId: shop.id, userId, role: "OWNER" } });
        return shop;
    }

    const post = (query: string) =>
        request(app.getHttpServer())
            .post("/graphql")
            .set("Content-Type", "application/json")
            .send({ query });

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = module.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        await prisma.vendor.deleteMany({ where: { id: { in: shopIds } } });
        await prisma.user.deleteMany({ where: { email: { in: emails } } });
        await prisma.$disconnect();
    });

    // Le statut reste 200 : la requête a été exécutée, et c'est le champ qui a échoué. Le
    // pilote de NestJS le ramène à 200 pour que le client lise `errors` comme une réponse.
    it("refuse me sans session", async () => {
        const response = await post(ME).expect(200);

        expect(response.body.data).toBeNull();
        expect(response.body.errors[0].extensions.code).toBe("UNAUTHENTICATED");
    });

    it("refuse un cookie de session fabriqué", async () => {
        const response = await post(ME)
            .set("Cookie", "better-auth.session_token=invente")
            .expect(200);

        expect(response.body.data).toBeNull();
        expect(response.body.errors[0].extensions.code).toBe("UNAUTHENTICATED");
    });

    it("rend le compte sans boutique", async () => {
        const { cookie, email } = await account("sans-boutique");

        const response = await post(ME).set("Cookie", cookie).expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.me).toEqual({ user: { email }, shop: null });
    });

    it("rend la boutique du membre", async () => {
        const { cookie, userId } = await account("membre");
        const shop = await memberOf(userId, "membre");

        const response = await post(ME).set("Cookie", cookie).expect(200);

        expect(response.body.data.me.shop).toEqual({
            name: shop.shopName,
            slug: shop.slug,
            suspended: false,
        });
    });

    it("dit qu'une boutique est suspendue", async () => {
        const { cookie, userId } = await account("suspendue");
        const shop = await memberOf(userId, "suspendue");
        await prisma.vendor.update({ where: { id: shop.id }, data: { suspendedAt: new Date() } });

        const response = await post(ME).set("Cookie", cookie).expect(200);

        expect(response.body.data.me.shop.suspended).toBe(true);
    });

    // Le web ne la montre plus, le téléphone non plus : les deux lisent par la même fonction.
    it("ne montre pas une boutique supprimée", async () => {
        const { cookie, userId } = await account("supprimee");
        const shop = await memberOf(userId, "supprimee");
        await prisma.vendor.update({ where: { id: shop.id }, data: { deletedAt: new Date() } });

        const response = await post(ME).set("Cookie", cookie).expect(200);

        expect(response.body.data.me.shop).toBeNull();
    });

    it("refuse un site tiers, l'origine null et un front", async () => {
        const origins = [
            "https://ailleurs.test",
            "null",
            process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "",
        ];
        for (const origin of origins) {
            await post(ME).set("Origin", origin).expect(403);
        }
    });

    // Le pilote monte Apollo par PRÉFIXE : `/graphql/x` exécute la requête comme `/graphql`.
    // Le filtre doit donc couvrir les sous-chemins aussi, avec une session valide, sans quoi
    // une page d'une autre origine lirait le compte de son visiteur par ce détour.
    it("refuse aussi un site tiers sur un sous-chemin de /graphql", async () => {
        const { cookie } = await account("sous-chemin");

        for (const path of ["/graphql/x", "/graphql/a/b"]) {
            await request(app.getHttpServer())
                .post(path)
                .set("Content-Type", "application/json")
                .set("Origin", "https://ailleurs.test")
                .set("Cookie", cookie)
                .send({ query: ME })
                .expect(403);
        }
    });

    // Ce qu'un navigateur reçoit en ouvrant l'adresse : une navigation n'envoie pas d'origine,
    // donc le filtre la laisse passer, et Apollo répond par sa page plutôt que par du JSON.
    it("sert Apollo Sandbox en développement, sans télémétrie", async () => {
        const response = await request(app.getHttpServer())
            .get("/graphql")
            .set("Accept", "text/html")
            .expect(200);

        expect(response.text).toContain("embeddableSandbox");
        expect(response.text).toContain('"runTelemetry":false');
    });

    it("accepte le terrain de jeu en développement", async () => {
        const { cookie, email } = await account("terrain");

        const response = await post(ME)
            .set("Origin", process.env["NEXT_PUBLIC_API_URL"] ?? "")
            .set("Cookie", cookie)
            .expect(200);

        expect(response.body.data.me.user.email).toBe(email);
    });

    // La forme d'une requête qu'un site tiers enverrait sans contrôle préalable du
    // navigateur. Elle porterait une origine, que le filtre refuse déjà ; Apollo la refuse
    // aussi sans elle, et ce test tient cette seconde ligne en place.
    //
    // Le statut ne suffit pas : sans la protection d'Apollo, la même requête rend aussi 400,
    // parce que Nest ne lit pas un corps `text/plain` et qu'Apollo le trouve vide. Seul le
    // message dit que c'est la protection qui a refusé.
    it("refuse une requête text/plain, que le navigateur enverrait sans contrôle", async () => {
        const response = await request(app.getHttpServer())
            .post("/graphql")
            .set("Content-Type", "text/plain")
            .send(JSON.stringify({ query: ME }))
            .expect(400);

        expect(response.body.errors[0].message).toContain("Cross-Site Request Forgery");
    });
});
