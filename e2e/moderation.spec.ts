import { expect, test, type Locator, type Page } from "@playwright/test";
import { URL_ADMIN, URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import {
    acceptPaymentMethods,
    createApprovedVendorShop,
    publishProduct,
    signInAsAdministrator,
} from "./helpers/accounts";

// Ce parcours traverse les trois applications et publie un produit qui passe par le worker
// d'images.
test.setTimeout(240_000);

// L'annonceur de route de Next porte le titre de la page hors de `main`, et le titre d'une
// fiche EST le nom du produit. Un `getByText` non restreint en trouve donc deux. Piège
// consigné dans `docs/pieges.md`.
function inMain(page: Page, text: string): Locator {
    return page.locator("main").getByText(text);
}

// Pose la devise de la boutique : sans elle, aucun prix ne se saisit.
async function chooseCurrency(page: Page): Promise<void> {
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();
}

// La ligne d'un produit dans la file, retrouvée par son titre.
//
// Le titre porte une marque propre au run, donc cette ligne est unique, et les assertions
// se lisent DEDANS : la file en porte des dizaines, et viser la page entière en trouverait
// autant que d'articles.
function queueRow(page: Page, title: string): Locator {
    return page.locator("li").filter({ hasText: title });
}

test("un administrateur retire un article, le vendeur le republie, et il revient en file", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const title = `Sac modéré ${suffix}`;

    const { shopName } = await createApprovedVendorShop(page, request, browser);
    await chooseCurrency(page);
    await acceptPaymentMethods(page, ["Paiement à la livraison"]);
    await publishProduct(page, title, "45");

    // Le visiteur le voit : sans cette observation, la disparition plus bas pourrait venir
    // de n'importe quelle autre condition d'éligibilité.
    const visiteur = await browser.newContext();
    const vitrine = await visiteur.newPage();
    await vitrine.goto(`${URL_STOREFRONT}/catalog`);
    await expect(inMain(vitrine, title)).toBeVisible();

    // L'ADMINISTRATEUR le trouve en file, puisqu'il vient d'être publié et que personne ne
    // l'a marqué.
    const admin = await browser.newContext();
    const bureau = await admin.newPage();
    await signInAsAdministrator(bureau);
    await bureau.goto(`${URL_ADMIN}/moderation`);
    await bureau.waitForLoadState("networkidle");
    await expect(queueRow(bureau, title)).toBeVisible();
    await expect(queueRow(bureau, title).getByText(shopName)).toBeVisible();

    // Il le retire, avec un motif. Le bloc s'ouvre sur un `summary`, pas un bouton, et le
    // motif n'a PAS de valeur par défaut : confirmer sans choisir accuserait de
    // contrefaçon quelqu'un qu'on voulait seulement rappeler à l'ordre.
    await queueRow(bureau, title).getByText("Retirer", { exact: true }).click();
    await queueRow(bureau, title)
        .getByRole("combobox", { name: "Motif du retrait" })
        .selectOption("MISLEADING_CONTENT");
    await queueRow(bureau, title)
        .getByRole("button", { name: "Confirmer le retrait", exact: true })
        .click();

    // On attend ce que l'ACTION a produit : la ligne QUITTE la file, le produit n'étant
    // plus publié. Chercher « Retirer » ou un libellé que l'écran portait déjà avant le
    // clic ne prouverait rien, `getByText` comparant par sous-chaîne sans tenir compte de
    // la casse.
    //
    // Le délai couvre une action serveur, sa revalidation et un re-rendu en mode
    // développement, qui dépassent le défaut de cinq secondes. Il ne masque aucun défaut :
    // si le retrait n'avait pas lieu, la ligne ne partirait jamais, quel que soit le
    // délai.
    await expect(queueRow(bureau, title)).toHaveCount(0, { timeout: 30_000 });

    // Le CATALOGUE l'a perdu.
    await vitrine.goto(`${URL_STOREFRONT}/catalog`);
    await expect(inMain(vitrine, title)).toHaveCount(0);

    // Le VENDEUR le retrouve en brouillon, là où il l'a toujours vu. Aucun écran nouveau de
    // son côté : le retrait est un avertissement, pas une confiscation.
    await page.goto(`${URL_VENDOR}/products`);
    await expect(inMain(page, title)).toBeVisible();

    // Il le REPUBLIE.
    await inMain(page, title).click();
    await page.waitForURL(/\/products\/[^/]+$/u);
    await page.getByRole("button", { name: "Publier", exact: true }).click();
    await expect(page.getByText("Publié")).toBeVisible();

    // Et il REVIENT en file. C'est l'assertion la plus importante du parcours : elle
    // éprouve de bout en bout la règle qui donne son mordant à l'avertissement, à savoir
    // que publier efface la marque d'examen. Sans elle, un vendeur republierait ce qu'on
    // lui a retiré sans jamais repasser devant personne.
    await bureau.goto(`${URL_ADMIN}/moderation`);
    await bureau.waitForLoadState("networkidle");
    await expect(queueRow(bureau, title)).toBeVisible();

    // Et le catalogue le remontre.
    await vitrine.goto(`${URL_STOREFRONT}/catalog`);
    await expect(inMain(vitrine, title)).toBeVisible();

    await visiteur.close();
    await admin.close();
});

test("marquer examiné sort l'article de la file sans le dépublier", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const title = `Sac examiné ${suffix}`;

    await createApprovedVendorShop(page, request, browser);
    await chooseCurrency(page);
    await acceptPaymentMethods(page, ["Paiement à la livraison"]);
    await publishProduct(page, title, "45");

    const admin = await browser.newContext();
    const bureau = await admin.newPage();
    await signInAsAdministrator(bureau);
    await bureau.goto(`${URL_ADMIN}/moderation`);
    await bureau.waitForLoadState("networkidle");

    await queueRow(bureau, title).getByRole("button", { name: "Examiné", exact: true }).click();
    // Même délai, et pour la même raison : on attend une écriture serveur suivie d'un
    // re-rendu, pas un changement local.
    await expect(queueRow(bureau, title)).toHaveCount(0, { timeout: 30_000 });

    // La DIFFÉRENCE avec un retrait, et la raison d'être de ce second parcours : l'article
    // reste publié et achetable. Marquer examiné ne change que ce que l'administration
    // voit.
    const visiteur = await browser.newContext();
    const vitrine = await visiteur.newPage();
    await vitrine.goto(`${URL_STOREFRONT}/catalog`);
    await expect(inMain(vitrine, title)).toBeVisible();

    await visiteur.close();
    await admin.close();
});
