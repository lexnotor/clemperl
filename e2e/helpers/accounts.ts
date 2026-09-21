import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { URL_ADMIN, URL_MAILPIT, URL_STOREFRONT } from "../../playwright.config";

export const PASSWORD = "motdepasse123";

// Cherche le courriel par destinataire plutôt que de prendre le dernier arrivé : les
// tests partagent une seule boîte Mailpit, et « le dernier » désigne un autre message
// dès que deux tests s'exécutent en parallèle.
// Attend le lien ATTENDU plutôt que « le dernier reçu ». Un même compte reçoit
// plusieurs courriels — vérification, puis réinitialisation — et une lecture unique
// attrape le précédent tant que le nouveau n'est pas indexé.
export async function linkFor(
    request: APIRequestContext,
    address: string,
    contains: string,
): Promise<string> {
    let found: string | undefined;

    await expect
        .poll(
            async () => {
                const search = await request.get(
                    `${URL_MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
                );
                const messages = (await search.json()).messages as { ID: string }[];

                for (const message of messages) {
                    const content = await request.get(
                        `${URL_MAILPIT}/api/v1/message/${message.ID}`,
                    );
                    const link = /https?:\/\/\S+/.exec((await content.json()).Text)?.[0];
                    if (link?.includes(contains) === true) {
                        found = link;
                        return true;
                    }
                }
                return false;
            },
            {
                message: `aucun courriel contenant un lien « ${contains} » pour ${address}`,
                timeout: 15_000,
            },
        )
        .toBe(true);

    return found as string;
}

// Attend qu'un courriel PORTANT ce fragment arrive, au lieu de lire le dernier message
// à l'instant de l'appel. Le courriel part hors transaction : il suit l'écriture de
// quelques dizaines de millisecondes, et une lecture unique attrape parfois le message
// précédent — celui de vérification d'adresse.
export async function expectSubjectFor(
    request: APIRequestContext,
    address: string,
    fragment: string,
): Promise<void> {
    await expect
        .poll(
            async () => {
                const search = await request.get(
                    `${URL_MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
                );
                const messages = (await search.json()).messages as { Subject: string }[];
                return messages.map((message) => message.Subject).join(" | ");
            },
            { message: `aucun courriel contenant « ${fragment} » pour ${address}`, timeout: 15_000 },
        )
        .toContain(fragment);
}

// Crée un compte et le vérifie par l'API : le parcours du formulaire a sa propre
// couverture, et le répéter ici allongerait chaque test sans rien prouver de plus.
export async function createVerifiedAccount(
    request: APIRequestContext,
    address: string,
): Promise<void> {
    await request.post(`${URL_STOREFRONT}/api/auth/sign-up/email`, {
        data: { email: address, password: PASSWORD, name: "Essai" },
    });
    await request.get(await linkFor(request, address, "/api/auth/verify-email"));
}

export async function signInFromPage(page: Page, address: string): Promise<void> {
    await page.request.post(`${URL_STOREFRONT}/api/auth/sign-in/email`, {
        data: { email: address, password: PASSWORD },
    });
}

export const ADMIN_EMAIL = "administration@clemperl.test";

// Aucun administrateur n'est semé : sur une base neuve, l'instance s'amorce par cette
// page, qui disparaît dès qu'un compte porte le rôle.
//
// La connexion est tentée DANS TOUS LES CAS, et aucune redirection n'est attendue après
// le clic. Deux fichiers de test tournent en parallèle et peuvent voir le bouton de
// création tous les deux : le perdant de la course reçoit « déjà installé » et reste sur
// la page. Se connecter ensuite vaut quel que soit celui qui a créé le compte.
export async function signInAsAdministrator(page: Page): Promise<void> {
    await page.goto(`${URL_ADMIN}/setup`);

    const bootstrap = page.getByRole("button", { name: "Créer l'administrateur" });
    if (await bootstrap.isVisible()) {
        await page.getByLabel("Nom").fill("Administration");
        await page.getByLabel("Adresse e-mail").fill(ADMIN_EMAIL);
        await page.getByLabel("Mot de passe").fill(PASSWORD);

        // L'amorçage redirige vers la connexion. Il FAUT attendre cette navigation :
        // partir ailleurs pendant qu'elle est en vol la fait avorter, et Chromium
        // accuse alors la page de destination (`net::ERR_ABORTED`).
        //
        // L'attente est tolérante, et c'est le point délicat : deux fichiers de test
        // tournent en parallèle et peuvent voir ce bouton tous les deux. Le perdant
        // reçoit « déjà installé », reste sur place, et ne navigue jamais. Exiger la
        // redirection le ferait échouer ; ne rien attendre rend l'autre instable.
        await Promise.all([
            page.waitForURL(/\/sign-in/, { timeout: 15_000 }).catch(() => undefined),
            bootstrap.click(),
        ]);
    }

    await signInFromPage(page, ADMIN_EMAIL);
}

// Mène un compte neuf jusqu'à une boutique validée, et rend son nom.
//
// Le parcours lui-même — dépôt, examen, décision — est le SUJET de
// `vendor-shop.spec.ts`, qui l'écrit en entier avec ses assertions. Ici il n'est qu'un
// préalable : les suites qui commencent après la validation l'appellent plutôt que de
// recopier une dizaine d'écrans dont elles ne vérifient rien.
export async function createApprovedVendorShop(
    page: Page,
    request: APIRequestContext,
    browser: Browser,
): Promise<{ address: string; shopName: string }> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const address = `vendeur-${suffix}@exemple.test`;
    const shopName = `Atelier ${suffix}`;

    await createVerifiedAccount(request, address);
    await signInFromPage(page, address);

    await page.goto(`${URL_STOREFRONT}/become-a-vendor`);
    await page.getByLabel("Nom de la boutique").fill(shopName);
    await page
        .getByLabel("Description")
        .fill("Joaillerie artisanale, pièces uniques montées à la main.");
    await page.getByLabel("Adresse e-mail de contact").fill(address);
    await page.getByLabel("Téléphone de contact").fill("+32470000000");
    await page.getByLabel("Joaillerie").check();
    await page.getByLabel("Forme juridique").fill("SRL");
    await page.getByLabel("Raison sociale").fill(`${shopName} SRL`);
    await page.getByLabel("Numéro d'enregistrement").fill("0123456789");
    await page.getByLabel("Pays (code à deux lettres)").fill("BE");
    await page.getByLabel("Registre de commerce").setInputFiles("e2e/fixtures/registry.pdf");
    await page.getByLabel("Pièce d'identité").setInputFiles("e2e/fixtures/identity.png");
    await page.getByRole("button", { name: "Déposer ma demande" }).click();

    // L'administrateur travaille dans un contexte SÉPARÉ : deux sessions dans le même
    // contexte partageraient le cookie et s'écraseraient.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdministrator(adminPage);

    await adminPage.goto(`${URL_ADMIN}/applications`);
    await adminPage.getByRole("link", { name: new RegExp(shopName) }).click();
    await adminPage.getByRole("button", { name: "Accepter" }).click();

    // Attendre que l'administration CONSTATE la décision : un clic ne fait que déclencher
    // la server action, et repartir trop tôt trouve un dossier encore en examen. Le piège
    // a déjà été payé en T1b.
    await adminPage.getByText("Accepté", { exact: false }).waitFor();
    await adminContext.close();

    return { address, shopName };
}
