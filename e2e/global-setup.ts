import { request } from "@playwright/test";
import { URL_ADMIN, URL_STOREFRONT, URL_VENDOR } from "../playwright.config";

// Visite chaque route une fois avant la suite.
//
// Sans effet contre la pile de production (`pnpm e2e:up`), qui ne compile rien. Utile
// contre la pile de développement, où Next compile au PREMIER accès — jusqu'à une
// vingtaine de secondes — et où des tests sains dépassent alors leur délai.
const ROUTES = [
    `${URL_STOREFRONT}/`,
    `${URL_STOREFRONT}/en`,
    `${URL_STOREFRONT}/sign-in`,
    `${URL_STOREFRONT}/sign-up`,
    `${URL_STOREFRONT}/forgot-password`,
    `${URL_STOREFRONT}/reset-password`,
    `${URL_STOREFRONT}/verify-email`,
    `${URL_STOREFRONT}/become-a-vendor`,
    `${URL_VENDOR}/`,
    `${URL_ADMIN}/`,
    `${URL_ADMIN}/setup`,
    `${URL_ADMIN}/applications`,
];

export default async function globalSetup(): Promise<void> {
    const contexte = await request.newContext();

    // Une route protégée redirige, et une route absente répond 404 : dans les deux cas
    // elle a été compilée, ce qui est tout ce qu'on cherche ici.
    await Promise.all(
        ROUTES.map((route) =>
            contexte.get(route, { timeout: 120_000 }).catch(() => undefined),
        ),
    );

    await contexte.dispose();
}
