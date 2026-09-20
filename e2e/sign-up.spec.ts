import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { URL_MAILPIT, URL_STOREFRONT } from "../playwright.config";

const PASSWORD = "motdepasse123";

// Cherche le courriel par destinataire plutôt que de prendre le dernier arrivé : les
// tests partagent une seule boîte Mailpit, et « le dernier » désigne un autre message
// dès que deux tests s'exécutent en parallèle.
async function lastLinkFor(request: APIRequestContext, address: string): Promise<string> {
    const search = await request.get(
        `${URL_MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
    );
    const [message] = (await search.json()).messages as { ID: string }[];
    expect(message, `aucun courriel reçu pour ${address}`).toBeDefined();

    const content = await request.get(`${URL_MAILPIT}/api/v1/message/${message?.ID}`);
    const link = /https?:\/\/\S+/.exec((await content.json()).Text)?.[0];
    expect(link, "le courriel ne contient aucun lien").toBeTruthy();
    return link as string;
}

// Passe par le VRAI formulaire, pas par l'API. Un appel HTTP direct prouverait que le
// gestionnaire répond, pas que la page fonctionne : c'est précisément l'écart où s'est
// logé le défaut d'hydratation qui soumettait le mot de passe en GET.
async function signUp(page: Page, address: string): Promise<void> {
    await page.goto(`${URL_STOREFRONT}/sign-up`);
    await page.getByLabel("Nom").fill("Essai");
    await page.getByLabel("Adresse e-mail").fill(address);
    await page.getByLabel("Mot de passe").fill(PASSWORD);
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByRole("heading")).toHaveText("Vérifiez votre adresse");
}

// Le message d'erreur du formulaire porte `role="alert"` — mais l'annonceur de route de
// Next aussi, sur toute page App Router. Sans restriction à `main`, le sélecteur en
// trouve deux et Playwright refuse de choisir.
function formError(page: Page): Locator {
    return page.locator("main p[role='alert']");
}

// La boutique n'affiche pas le compte connecté : seuls le vendeur et l'administration
// le font. La preuve qu'une session est bien ouverte passe donc par ce que le serveur
// en dit, interrogé avec les cookies du navigateur — pas par un pixel à l'écran.
async function waitForOpenSession(page: Page, address: string): Promise<void> {
    await page.waitForURL(`${URL_STOREFRONT}/`);
    const response = await page.request.get(`${URL_STOREFRONT}/api/auth/get-session`);
    expect((await response.json())?.user?.email).toBe(address);
}

async function signIn(page: Page, address: string, password: string): Promise<void> {
    await page.goto(`${URL_STOREFRONT}/sign-in`);
    await page.getByLabel("Adresse e-mail").fill(address);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
}

test("l'inscription envoie un courriel, et la connexion est refusée tant qu'on ne l'a pas suivi", async ({
    page,
    request,
}) => {
    const address = `inscription-${Date.now()}@exemple.test`;
    await signUp(page, address);

    // Critère 1 : le courriel part réellement. Un compte créé sans courriel envoyé est
    // un compte que personne ne peut activer.
    await lastLinkFor(request, address);

    // Critère 2 : le refus est explicite et en français. Le message générique
    // « identifiants incorrects » enverrait l'utilisateur vérifier un mot de passe
    // pourtant juste.
    await signIn(page, address, PASSWORD);
    await expect(formError(page)).toHaveText(
        "Vérifiez votre adresse e-mail avant de vous connecter.",
    );
});

test("après vérification, la connexion aboutit", async ({ page, request }) => {
    const address = `verifie-${Date.now()}@exemple.test`;
    await signUp(page, address);

    await page.goto(await lastLinkFor(request, address));
    await signIn(page, address, PASSWORD);

    // Critère 3 : la boutique reconnaît la session côté serveur. Vérifier l'absence
    // d'erreur ne suffirait pas — un formulaire muet passerait aussi.
    await waitForOpenSession(page, address);
});

test("la réinitialisation de mot de passe fonctionne de bout en bout", async ({
    page,
    request,
}) => {
    const address = `oubli-${Date.now()}@exemple.test`;
    const newPassword = "nouveaumotdepasse456";
    await signUp(page, address);
    await page.goto(await lastLinkFor(request, address));

    await page.goto(`${URL_STOREFRONT}/forgot-password`);
    await page.locator("input[name='email']").fill(address);
    await page.getByRole("button", { name: "Recevoir un lien" }).click();
    await expect(page.getByText("un courriel vient de partir")).toBeVisible();

    await page.goto(await lastLinkFor(request, address));
    await page.locator("input[name='password']").fill(newPassword);
    await page.getByRole("button", { name: "Enregistrer" }).click();

    // Critère 7 : le nouveau mot de passe ouvre la session, et l'ancien ne l'ouvre plus.
    // Sans la seconde moitié, une réinitialisation qui n'écraserait rien passerait.
    await signIn(page, address, newPassword);
    await waitForOpenSession(page, address);

    // La déconnexion passe par une requête émise DEPUIS la page : Better Auth refuse
    // un appel sans en-tête `Origin` reconnu.
    await page.evaluate(async () => {
        await fetch("/api/auth/sign-out", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
    });
    await signIn(page, address, PASSWORD);
    await expect(formError(page)).toHaveText("Adresse e-mail ou mot de passe incorrect.");
});
