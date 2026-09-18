import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { URL_MAILPIT, URL_STOREFRONT } from "../playwright.config";

const motDePasse = "motdepasse123";

// Cherche le courriel par destinataire plutôt que de prendre le dernier arrivé : les
// tests partagent une seule boîte Mailpit, et « le dernier » désigne un autre message
// dès que deux tests s'exécutent en parallèle.
async function dernierLienPour(request: APIRequestContext, adresse: string): Promise<string> {
    const recherche = await request.get(
        `${URL_MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${adresse}`)}`,
    );
    const [message] = (await recherche.json()).messages as { ID: string }[];
    expect(message, `aucun courriel reçu pour ${adresse}`).toBeDefined();

    const contenu = await request.get(`${URL_MAILPIT}/api/v1/message/${message?.ID}`);
    const lien = /https?:\/\/\S+/.exec((await contenu.json()).Text)?.[0];
    expect(lien, "le courriel ne contient aucun lien").toBeTruthy();
    return lien as string;
}

// Passe par le VRAI formulaire, pas par l'API. Un appel HTTP direct prouverait que le
// gestionnaire répond, pas que la page fonctionne : c'est précisément l'écart où s'est
// logé le défaut d'hydratation qui soumettait le mot de passe en GET.
async function sInscrire(page: Page, adresse: string): Promise<void> {
    await page.goto(`${URL_STOREFRONT}/inscription`);
    await page.getByLabel("Nom").fill("Essai");
    await page.getByLabel("Adresse e-mail").fill(adresse);
    await page.getByLabel("Mot de passe").fill(motDePasse);
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(page.getByRole("heading")).toHaveText("Vérifiez votre adresse");
}

// Le message d'erreur du formulaire porte `role="alert"` — mais l'annonceur de route de
// Next aussi, sur toute page App Router. Sans restriction à `main`, le sélecteur en
// trouve deux et Playwright refuse de choisir.
function erreurFormulaire(page: Page): Locator {
    return page.locator("main p[role='alert']");
}

// La boutique n'affiche pas le compte connecté : seuls le vendeur et l'administration
// le font. La preuve qu'une session est bien ouverte passe donc par ce que le serveur
// en dit, interrogé avec les cookies du navigateur — pas par un pixel à l'écran.
async function attendreSessionOuverte(page: Page, adresse: string): Promise<void> {
    await page.waitForURL(`${URL_STOREFRONT}/`);
    const reponse = await page.request.get(`${URL_STOREFRONT}/api/auth/get-session`);
    expect((await reponse.json())?.user?.email).toBe(adresse);
}

async function seConnecter(page: Page, adresse: string, mot: string): Promise<void> {
    await page.goto(`${URL_STOREFRONT}/connexion`);
    await page.getByLabel("Adresse e-mail").fill(adresse);
    await page.getByLabel("Mot de passe").fill(mot);
    await page.getByRole("button", { name: "Se connecter" }).click();
}

test("l'inscription envoie un courriel, et la connexion est refusée tant qu'on ne l'a pas suivi", async ({
    page,
    request,
}) => {
    const adresse = `inscription-${Date.now()}@exemple.test`;
    await sInscrire(page, adresse);

    // Critère 1 : le courriel part réellement. Un compte créé sans courriel envoyé est
    // un compte que personne ne peut activer.
    await dernierLienPour(request, adresse);

    // Critère 2 : le refus est explicite et en français. Le message générique
    // « identifiants incorrects » enverrait l'utilisateur vérifier un mot de passe
    // pourtant juste.
    await seConnecter(page, adresse, motDePasse);
    await expect(erreurFormulaire(page)).toHaveText(
        "Vérifiez votre adresse e-mail avant de vous connecter.",
    );
});

test("après vérification, la connexion aboutit", async ({ page, request }) => {
    const adresse = `verifie-${Date.now()}@exemple.test`;
    await sInscrire(page, adresse);

    await page.goto(await dernierLienPour(request, adresse));
    await seConnecter(page, adresse, motDePasse);

    // Critère 3 : la boutique reconnaît la session côté serveur. Vérifier l'absence
    // d'erreur ne suffirait pas — un formulaire muet passerait aussi.
    await attendreSessionOuverte(page, adresse);
});

test("la réinitialisation de mot de passe fonctionne de bout en bout", async ({
    page,
    request,
}) => {
    const adresse = `oubli-${Date.now()}@exemple.test`;
    const nouveau = "nouveaumotdepasse456";
    await sInscrire(page, adresse);
    await page.goto(await dernierLienPour(request, adresse));

    await page.goto(`${URL_STOREFRONT}/mot-de-passe-oublie`);
    await page.locator("input[name='email']").fill(adresse);
    await page.getByRole("button", { name: "Recevoir un lien" }).click();
    await expect(page.getByText("un courriel vient de partir")).toBeVisible();

    await page.goto(await dernierLienPour(request, adresse));
    await page.locator("input[name='motDePasse']").fill(nouveau);
    await page.getByRole("button", { name: "Enregistrer" }).click();

    // Critère 7 : le nouveau mot de passe ouvre la session, et l'ancien ne l'ouvre plus.
    // Sans la seconde moitié, une réinitialisation qui n'écraserait rien passerait.
    await seConnecter(page, adresse, nouveau);
    await attendreSessionOuverte(page, adresse);

    // La déconnexion passe par une requête émise DEPUIS la page : Better Auth refuse
    // un appel sans en-tête `Origin` reconnu.
    await page.evaluate(async () => {
        await fetch("/api/auth/sign-out", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
    });
    await seConnecter(page, adresse, motDePasse);
    await expect(erreurFormulaire(page)).toHaveText("Adresse e-mail ou mot de passe incorrect.");
});
