import { expect, test } from "@playwright/test";
import { URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import { createApprovedVendorShop } from "./helpers/accounts";

// Sériel : le premier test amorce l'administrateur, que les autres trouvent déjà là.
test.describe.configure({ mode: "serial" });

// Ce parcours traverse trois applications et une dizaine d'écrans, dont plusieurs sont
// compilés à la demande au premier passage.
test.setTimeout(180_000);

// La locale par défaut n'est PAS préfixée : `/fr/catalog` redirige vers `/catalog`. Viser
// l'URL préfixée ferait suivre une redirection à chaque navigation, ce qui marche mais
// masque une faute de route le jour où elle arrive.
test("un visiteur parcourt le catalogue, filtre, et ouvre une fiche", async ({
    page,
    request,
    browser,
}) => {
    // La base du navigateur n'est PAS vidée entre deux runs : un titre fixe retrouverait
    // le produit de la fois précédente, et le sélecteur en verrait deux. Le titre porte
    // donc une marque propre à ce run, comme les suites d'intégration portent un préfixe.
    const titre = `Sac cabas du catalogue ${Date.now()}`;

    // Un produit publié avec sa photo : le catalogue n'a rien à montrer sans lui.
    await createApprovedVendorShop(page, request, browser);
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await page.goto(`${URL_VENDOR}/products/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill(titre);
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Cuir pleine fleur tanné végétal, coutures à la main, doublure en lin.");
    await page.getByRole("combobox", { name: "Catégorie" }).selectOption("LEATHER_GOODS");
    await page.getByRole("textbox", { name: "Prix", exact: true }).fill("180,00");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL(/\/products\/[^/]+$/);

    // UN AXE, et c'est le point. Sans lui, le sélecteur de déclinaison n'a rien à choisir,
    // donc le parcours ne vérifie jamais que le prix suit la sélection ni que le lien de
    // contact annonce la bonne déclinaison, qui sont deux critères de la tranche.
    await page.getByRole("button", { name: "Ajouter un axe" }).click();
    await page.getByRole("textbox", { name: "Nom de l'axe" }).fill("Taille");
    await page.getByRole("textbox", { name: "Valeurs" }).fill("S, L");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Votre produit est enregistré.")).toBeVisible();

    await page.getByLabel("Ajouter des photos").setInputFiles("e2e/fixtures/product.jpg");
    await expect(page.getByTestId("vignette")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Publié")).toBeVisible();

    // Le visiteur, SANS session : c'est tout l'objet de cette tranche.
    const visiteur = await browser.newPage();
    await visiteur.goto(`${URL_STOREFRONT}/catalog`);
    await expect(visiteur.getByText(titre)).toBeVisible();

    // Critère 2 : le filtre ne remonte que les produits de cette catégorie.
    await visiteur.getByRole("combobox", { name: "Catégorie" }).selectOption("JEWELLERY");
    await visiteur.getByRole("button", { name: "Rechercher" }).click();
    await expect(visiteur.getByText(titre)).toHaveCount(0);

    await visiteur.getByRole("combobox", { name: "Catégorie" }).selectOption("LEATHER_GOODS");
    await visiteur.getByRole("button", { name: "Rechercher" }).click();
    await visiteur.getByText(titre).click();

    // Critère 7 : le prix SUIT la déclinaison choisie, et le lien de contact annonce cette
    // déclinaison avec son prix. Le lien était calculé une fois pour toute la fiche, donc
    // il annonçait le nom de l'axe et le prix du moins cher quelle que soit la sélection :
    // un visiteur qui choisissait la plus chère envoyait un prix faux au vendeur.
    await visiteur.waitForURL(/\/shops\/[^/]+\/[^/]+$/);
    await expect(visiteur.getByRole("heading", { name: titre })).toBeVisible();
    await expect(visiteur.getByTestId("prix")).toContainText("Choisissez une déclinaison");

    await visiteur.getByRole("combobox", { name: "Taille" }).selectOption({ label: "L" });
    await expect(visiteur.getByTestId("prix")).toContainText("180,00");

    const contact = visiteur.getByRole("link", { name: "Contacter la boutique" });
    const href = decodeURIComponent((await contact.getAttribute("href")) ?? "");
    expect(href).toContain("mailto:");
    expect(href).toContain("Taille : L");
    expect(href).toContain("180,00");

    // Le nom de la boutique mène à sa vitrine, qui montre le même article.
    await visiteur.getByRole("link", { name: /Atelier|Boutique/ }).first().click();
    await visiteur.waitForURL(/\/shops\/[^/]+$/);
    await expect(visiteur.getByText(titre)).toBeVisible();
    await visiteur.close();
});

// Critère 1 : un chemin qui ne désigne rien de publié répond 404, et non une page vide qui
// laisserait croire que la boutique existe.
test("une boutique ou un produit inexistant répond 404", async ({ page }) => {
    const boutique = await page.goto(`${URL_STOREFRONT}/shops/boutique-inexistante`);
    expect(boutique?.status()).toBe(404);

    const produit = await page.goto(
        `${URL_STOREFRONT}/shops/boutique-inexistante/produit-inexistant`,
    );
    expect(produit?.status()).toBe(404);
});
