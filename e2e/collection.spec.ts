import { expect, test, type Locator, type Page } from "@playwright/test";
import { URL_VENDOR } from "../playwright.config";
import { createApprovedVendorShop } from "./helpers/accounts";

// L'annonceur de route de Next porte le titre de la page hors de `main`, et le titre
// d'une fiche EST le nom du produit. Un `getByText` non restreint en trouve donc deux,
// et le second est là ou non selon l'instant. Piège consigné dans `docs/pieges.md`.
function inMain(page: Page, text: string): Locator {
    return page.locator("main").getByText(text);
}

// Sériel : le premier test amorce l'administrateur, que les autres trouvent déjà là.
test.describe.configure({ mode: "serial" });

// Ce parcours crée deux produits avec photo, chacune passant par le worker d'images.
test.setTimeout(240_000);

// Crée un produit PUBLIÉ, photo comprise. Le catalogue, et donc une collection, n'a rien
// à montrer sans image prête : c'est une condition de `conditions()` et non un rappel.
async function publishProduct(page: Page, titre: string): Promise<void> {
    await page.goto(`${URL_VENDOR}/products/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill(titre);
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Cuir pleine fleur tanné végétal, coutures à la main, doublure en lin.");
    await page.getByRole("combobox", { name: "Catégorie" }).selectOption("LEATHER_GOODS");
    await page.getByRole("textbox", { name: "Prix", exact: true }).fill("180,00");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL(/\/products\/[^/]+$/);

    await page.getByLabel("Ajouter des photos").setInputFiles("e2e/fixtures/product.jpg");
    await expect(page.getByTestId("vignette")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Publié")).toBeVisible();
}

// La ligne d'un article dans la liste ordonnée, ciblée par son titre : les boutons
// « Monter » et « Descendre » existent sur chaque ligne, donc les viser globalement
// n'identifierait rien.
function itemRow(page: Page, titre: string): Locator {
    return page.locator("main li").filter({ hasText: titre });
}

test("un vendeur range deux articles, choisit leur ordre, et le visiteur le voit", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const premier = `Sac cabas rangé ${suffix}`;
    const second = `Étole rangée ${suffix}`;
    const titreCollection = `Soldes ${suffix}`;

    await createApprovedVendorShop(page, request, browser);
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await publishProduct(page, premier);
    await publishProduct(page, second);

    // Critère 1 : la collection naît en brouillon.
    await page.goto(`${URL_VENDOR}/collections/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill(titreCollection);
    await page.getByRole("button", { name: "Créer la collection" }).click();
    await page.waitForURL(/\/collections\/[^/]+$/);
    await expect(inMain(page, "Brouillon")).toBeVisible();

    // Critère 2 : on range, puis on réordonne. Les deux articles entrent en queue, donc
    // dans l'ordre de publication ; on inverse.
    for (const titre of [premier, second]) {
        await page.getByRole("combobox", { name: "Ajouter un produit" }).selectOption({ label: titre });
        await page.getByRole("button", { name: "Ajouter un produit" }).click();
        await expect(itemRow(page, titre)).toBeVisible();
    }

    await itemRow(page, second).getByRole("button", { name: "Monter" }).click();

    // Attendre que l'ordre AFFICHÉ change avant de recharger. Un clic ne fait que
    // déclencher l'action serveur, et recharger trop tôt relit l'ancien ordre : le test
    // passait seul et tombait à deux workers, la machine plus chargée rendant l'écriture
    // plus lente que la navigation. Piège déjà payé deux fois dans ce dépôt.
    const rangs = page.locator("main ol li");
    await expect(rangs.nth(0)).toContainText(second);

    // Puis seulement, prouver que la base le porte et non l'affichage.
    await page.reload();
    await expect(rangs.nth(0)).toContainText(second);
    await expect(rangs.nth(1)).toContainText(premier);

    // Le premier de la liste ne peut plus monter : le bouton existe, il est désactivé.
    await expect(itemRow(page, second).getByRole("button", { name: "Monter" })).toBeDisabled();

    // Critère 3 : publier, puis suivre le lien public. L'atteindre par une URL forgée
    // sauterait le lien que le vendeur utilise vraiment.
    await page.getByRole("button", { name: "Publier la collection" }).click();
    await expect(inMain(page, "Publiée")).toBeVisible();

    const lien = page.getByRole("link", { name: "Voir la page publique" });
    const href = (await lien.getAttribute("href")) ?? "";
    expect(href).toContain("/collections/");

    // Le visiteur, SANS session : c'est tout l'objet d'une page publique.
    const visiteur = await browser.newPage();
    await visiteur.goto(href);
    await expect(visiteur.getByRole("heading", { level: 1 })).toHaveText(titreCollection);

    // L'ORDRE DU VENDEUR, et non le plus récent d'abord : c'est le cœur de la tranche.
    const cartes = visiteur.locator("main ul li");
    await expect(cartes.nth(0)).toContainText(second);
    await expect(cartes.nth(1)).toContainText(premier);

    // Critère 4 : un article dépublié quitte la page publique et garde son rang côté
    // vendeur.
    await page.goto(`${URL_VENDOR}/products`);
    await inMain(page, second).click();
    await page.waitForURL(/\/products\/[^/]+$/);
    await page.getByRole("button", { name: "Repasser en brouillon" }).click();
    await expect(inMain(page, "Brouillon")).toBeVisible();

    await visiteur.reload();
    await expect(inMain(visiteur, second)).toHaveCount(0);
    await expect(inMain(visiteur, premier)).toBeVisible();

    await page.goto(`${URL_VENDOR}/collections`);
    await inMain(page, titreCollection).click();
    await page.waitForURL(/\/collections\/[^/]+$/);
    await expect(page.locator("main ol li").nth(0)).toContainText(second);
    await expect(itemRow(page, second)).toContainText("non visible publiquement");

    await visiteur.close();
});

// Critère 6 : la vitrine mène aux collections publiées, et à elles seules.
test("une collection en brouillon ne se visite pas", async ({ page, request, browser }) => {
    const suffix = Date.now();
    const titreCollection = `Brouillon ${suffix}`;

    await createApprovedVendorShop(page, request, browser);
    await page.goto(`${URL_VENDOR}/collections/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill(titreCollection);
    await page.getByRole("button", { name: "Créer la collection" }).click();
    await page.waitForURL(/\/collections\/[^/]+$/);

    // Aucun lien public n'est proposé tant qu'elle est en brouillon.
    await expect(page.getByRole("link", { name: "Voir la page publique" })).toHaveCount(0);
});
