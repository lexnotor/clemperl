import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { URL_MAILPIT, URL_STOREFRONT } from "../../playwright.config";

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

