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

// L'annonceur de route de Next porte le titre de la page hors de `main`. Un `getByText` non
// restreint en trouve donc deux. Piège consigné dans `docs/pieges.md`.
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

// La ligne d'une boutique dans l'écran d'administration, retrouvée par son nom.
//
// Le nom est unique par run, donc cette ligne l'est aussi, et l'assertion d'état se lit
// DEDANS : `getByTestId("etat")` sur la page entière en trouverait autant que de boutiques.
function shopRow(page: Page, shopName: string): Locator {
    return page.locator("li").filter({ hasText: shopName });
}

async function setSuspension(page: Page, shopName: string, bouton: string): Promise<void> {
    await page.goto(`${URL_ADMIN}/shops`);
    await page.waitForLoadState("networkidle");
    await shopRow(page, shopName).getByRole("button", { name: bouton, exact: true }).click();
}

test("un administrateur suspend une boutique, le catalogue la perd, le vendeur garde son espace", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const title = `Sac suspendu ${suffix}`;

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

    // L'adresse de la fiche est RELEVÉE, jamais devinée : la dériver du nom de la boutique
    // recopierait la règle de slug de l'administration, et le test passerait à côté du jour
    // où cette règle changerait.
    await inMain(vitrine, title).click();
    await vitrine.waitForURL(/\/shops\/[^/]+\/[^/]+$/u);
    const fiche = vitrine.url();

    // L'ADMINISTRATEUR suspend.
    const admin = await browser.newContext();
    const bureau = await admin.newPage();
    await signInAsAdministrator(bureau);
    await setSuspension(bureau, shopName, "Suspendre");

    // On attend ce que l'ACTION a produit, et par une correspondance EXACTE : « Suspendue »
    // contient « Suspendu », et le bouton voisin s'appelle « Suspendre ». Une correspondance
    // par sous-chaîne attraperait un mot que l'écran portait déjà avant le clic, et le test
    // passerait sans rien prouver.
    // Le délai couvre une action serveur, sa revalidation et un re-rendu en mode
    // développement, qui dépassent le défaut de cinq secondes. Il ne masque rien : si la
    // suspension n'avait pas lieu, le bouton ne changerait jamais.
    await expect(
        shopRow(bureau, shopName).getByRole("button", { name: "Rétablir" }),
    ).toBeVisible({ timeout: 30_000 });

    // Le CATALOGUE l'a perdu.
    await vitrine.goto(`${URL_STOREFRONT}/catalog`);
    await expect(inMain(vitrine, title)).toHaveCount(0);

    // Et la vitrine de la boutique répond 404, pas seulement la liste.
    const reponse = await vitrine.goto(fiche);
    expect(reponse?.status()).toBe(404);

    // Le VENDEUR garde son espace, et le bandeau le lui dit. C'est la décision centrale de
    // la tranche : c'est la boutique qui est suspendue, pas la personne.
    await page.goto(`${URL_VENDOR}/products`);
    await expect(inMain(page, "Votre boutique n'apparaît pas au catalogue")).toBeVisible();
    await expect(inMain(page, title)).toBeVisible();

    // RÉTABLIE, la boutique revient.
    await setSuspension(bureau, shopName, "Rétablir");
    await expect(
        shopRow(bureau, shopName).getByRole("button", { name: "Suspendre", exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    await vitrine.goto(`${URL_STOREFRONT}/catalog`);
    await expect(inMain(vitrine, title)).toBeVisible();

    // Le bandeau disparaît avec la suspension.
    await page.goto(`${URL_VENDOR}/products`);
    await expect(inMain(page, "Votre boutique n'apparaît pas au catalogue")).toHaveCount(0);

    await visiteur.close();
    await admin.close();
});
