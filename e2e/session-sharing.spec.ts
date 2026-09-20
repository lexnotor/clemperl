import { expect, test, type APIRequestContext } from "@playwright/test";
import { URL_ADMIN, URL_MAILPIT, URL_STOREFRONT, URL_VENDOR } from "../playwright.config";

const password = "motdepasse123";

// Crée un compte et le vérifie en suivant le lien reçu dans Mailpit. Le parcours par le
// formulaire est couvert par `sign-up.spec.ts` ; ici il n'est qu'un préalable au
// sujet réel, le partage de session entre applications, et passe donc par l'API.
async function createVerifiedAccount(request: APIRequestContext, address: string): Promise<void> {
    await request.post(`${URL_STOREFRONT}/api/auth/sign-up/email`, {
        data: { email: address, password: password, name: "Essai" },
    });
    const messages = await request.get(
        `${URL_MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
    );
    const [latest] = (await messages.json()).messages as { ID: string }[];
    // Sans cette assertion, l'absence de courriel remonte en « Cannot read properties of
    // undefined » et l'on cherche le défaut dans le test plutôt que dans l'inscription.
    expect(latest, `aucun courriel reçu pour ${address}`).toBeDefined();

    const content = await request.get(`${URL_MAILPIT}/api/v1/message/${latest?.ID}`);
    const link = /https?:\/\/\S+/.exec((await content.json()).Text)?.[0] ?? "";
    await request.get(link);
}

test("une session ouverte sur la boutique vaut sur les trois fronts", async ({ page, request }) => {
    const address = `partage-${Date.now()}@exemple.test`;
    await createVerifiedAccount(request, address);

    // La session est ouverte par l'API et non par le formulaire : le sujet de ce test
    // est le partage du cookie entre applications, pas le rendu d'un formulaire, qui a
    // sa propre couverture.
    await page.request.post(`${URL_STOREFRONT}/api/auth/sign-in/email`, {
        data: { email: address, password: password },
    });

    await page.goto(`${URL_VENDOR}/`);
    await expect(page.getByTestId("utilisateur")).toHaveText(address);

    await page.goto(`${URL_ADMIN}/`);
    await expect(page.getByTestId("utilisateur")).toHaveText(address);
});

test("la déconnexion vaut pour les trois fronts", async ({ page, request }) => {
    const address = `deco-${Date.now()}@exemple.test`;
    await createVerifiedAccount(request, address);

    await page.request.post(`${URL_STOREFRONT}/api/auth/sign-in/email`, {
        data: { email: address, password: password },
    });
    await page.goto(`${URL_VENDOR}/`);
    await expect(page.getByTestId("utilisateur")).toHaveText(address);

    // La déconnexion passe par une requête émise DEPUIS la page : Better Auth refuse
    // un appel sans en-tête `Origin` reconnu, protection contre les requêtes
    // inter-sites. `page.request` ne pose pas cet en-tête, le navigateur si.
    await page.goto(`${URL_STOREFRONT}/`);
    await page.evaluate(async () => {
        await fetch("/api/auth/sign-out", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
    });

    await page.goto(`${URL_VENDOR}/`);
    await expect(page.getByTestId("utilisateur")).toHaveText("anonyme");
});
