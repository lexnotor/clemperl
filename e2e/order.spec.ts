import { expect, test, type Locator, type Page } from "@playwright/test";
import { URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import { createApprovedVendorShop, createVerifiedAccount, signInFromPage } from "./helpers/accounts";

// L'annonceur de route de Next porte le titre de la page hors de `main`, et le titre d'une
// fiche EST le nom du produit. Un `getByText` non restreint en trouve donc deux. Piège
// consigné dans `docs/pieges.md`.
function inMain(page: Page, text: string): Locator {
    return page.locator("main").getByText(text);
}

// Sériel : le premier test amorce l'administrateur, que les autres trouvent déjà là.
test.describe.configure({ mode: "serial" });

// Ce parcours traverse trois applications, crée un produit avec photo qui passe par le
// worker d'images, et va jusqu'à l'expédition.
test.setTimeout(240_000);

// Publie un produit complet depuis l'espace vendeur. Le catalogue, donc le panier, n'a rien
// à montrer sans image prête : c'est une condition de `conditions()`, pas un rappel.
async function publishProduct(page: Page, title: string, price: string): Promise<void> {
    await page.goto(`${URL_VENDOR}/products/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill(title);
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Cuir pleine fleur tanné végétal, coutures à la main, doublure en lin.");
    await page.getByRole("combobox", { name: "Catégorie" }).selectOption("LEATHER_GOODS");
    await page.getByRole("textbox", { name: "Prix", exact: true }).fill(price);
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL(/\/products\/[^/]+$/);

    await page.getByLabel("Ajouter des photos").setInputFiles("e2e/fixtures/product.jpg");
    await expect(page.getByTestId("vignette")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Publié")).toBeVisible();
}

test("un visiteur remplit son panier, se connecte, commande, et le vendeur expédie", async ({
    page,
    request,
    browser,
}) => {
    // Le titre porte une marque propre au run : la base n'est pas vidée entre deux
    // passages, et un titre fixe retrouverait le produit de la fois précédente.
    const suffix = Date.now();
    const title = `Sac commandé ${suffix}`;

    await createApprovedVendorShop(page, request, browser);
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await publishProduct(page, title, "180,00");

    // L'ACHETEUR, sans session : son panier vit dans son navigateur, et c'est tout l'objet
    // de la première moitié de la tranche.
    const buyerContext = await browser.newContext();
    const buyer = await buyerContext.newPage();
    await buyer.goto(`${URL_STOREFRONT}/catalog`);
    await inMain(buyer, title).click();
    await buyer.waitForURL(/\/shops\/[^/]+\/[^/]+$/);

    await buyer.getByRole("button", { name: "Ajouter au panier" }).click();
    await expect(buyer.getByRole("status")).toContainText("Ajouté à votre panier");

    // Sans compte, le serveur ne sait RIEN du panier : la page annonce ce que le navigateur
    // porte, sans le nommer. La spec ne promet de retrouver les articles qu'après
    // connexion, et dire « votre panier est vide » ici mentirait.
    await buyer.goto(`${URL_STOREFRONT}/cart`);
    await expect(inMain(buyer, "1 article en attente")).toBeVisible();

    // La remontée : le panier local devient le panier serveur à la première visite
    // connectée, et c'est le point de couture de la tranche.
    //
    // Le compte est créé depuis le contexte de L'ACHETEUR, et non celui du test : ce
    // dernier a déjà suivi un lien de vérification pour le vendeur, donc il porte une
    // session, et Better Auth y refuse toute écriture sans en-tête `Origin`.
    const address = `acheteur-${suffix}@exemple.test`;
    await createVerifiedAccount(buyerContext.request, address);
    await signInFromPage(buyer, address);
    await buyer.goto(`${URL_STOREFRONT}/cart`);
    await expect(inMain(buyer, title)).toBeVisible();
    await expect(buyer.locator("main")).toContainText("180,00");

    await buyer.getByRole("link", { name: "Passer commande" }).click();
    await buyer.waitForURL(/\/checkout$/);

    await buyer.getByLabel("Nom du destinataire").fill("Awa Diop");
    await buyer.getByLabel("Téléphone").fill("+32470000000");
    await buyer.getByLabel("Adresse").fill("12 rue des Artisans");
    await buyer.getByLabel("Ville").fill("Bruxelles");
    await buyer.getByLabel("Pays (code à deux lettres)").fill("BE");
    await buyer.getByRole("textbox", { name: /Un mot pour/ }).fill("Livrer en matinée.");
    await buyer.getByRole("button", { name: "Confirmer la commande" }).click();

    // La commande existe et porte sa référence, que l'URL reprend.
    await buyer.waitForURL(/\/orders\/CMD-/);
    await expect(inMain(buyer, "Reçue")).toBeVisible();
    await expect(inMain(buyer, "Awa Diop")).toBeVisible();
    const reference = (await buyer.getByRole("heading", { level: 1 }).textContent()) ?? "";
    expect(reference).toContain("CMD-");

    // Le panier est vidé par la validation : le relire doit le dire.
    await buyer.goto(`${URL_STOREFRONT}/cart`);
    await expect(inMain(buyer, "Votre panier est vide.")).toBeVisible();

    // LE VENDEUR la voit, et la fait avancer. On vise ce que l'action a PRODUIT, jamais un
    // mot que l'écran portait déjà.
    await page.goto(`${URL_VENDOR}/orders`);
    await inMain(page, reference).click();
    await page.waitForURL(/\/orders\/[^/]+$/);
    await expect(inMain(page, "Livrer en matinée.")).toBeVisible();

    await page.getByRole("button", { name: "Accepter" }).click();
    await expect(page.getByRole("button", { name: "Marquer expédiée" })).toBeVisible();

    await page.getByRole("button", { name: "Marquer expédiée" }).click();
    await expect(inMain(page, "Expédiée")).toBeVisible();

    // L'acheteur lit le même état : c'est la seule preuve que les deux écrans parlent de
    // la même commande.
    await buyer.goto(`${URL_STOREFRONT}/orders`);
    await expect(inMain(buyer, "Expédiée")).toBeVisible();

    await buyerContext.close();
});

// Critère 2 de la spec, et le seul endroit qui éprouve le refus de bout en bout : un
// article dépublié entre la mise au panier et la validation ne devient pas une commande.
test("un article dépublié entre le panier et la validation est refusé", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const title = `Sac retiré ${suffix}`;

    await createApprovedVendorShop(page, request, browser);
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await publishProduct(page, title, "90,00");

    const address = `refus-${suffix}@exemple.test`;
    const buyerContext = await browser.newContext();
    const buyer = await buyerContext.newPage();
    await createVerifiedAccount(buyerContext.request, address);
    await signInFromPage(buyer, address);

    await buyer.goto(`${URL_STOREFRONT}/catalog`);
    await inMain(buyer, title).click();
    await buyer.waitForURL(/\/shops\/[^/]+\/[^/]+$/);
    await buyer.getByRole("button", { name: "Ajouter au panier" }).click();
    await expect(buyer.getByRole("status")).toContainText("Ajouté à votre panier");

    // Le vendeur dépublie PENDANT que l'acheteur remplit son adresse.
    await buyer.goto(`${URL_STOREFRONT}/checkout`);
    await page.getByRole("button", { name: "Repasser en brouillon" }).click();

    // On attend ce que l'action a PRODUIT, et non un mot que l'écran portait peut-être
    // déjà : le bouton ne redevient « Publier » qu'une fois l'écriture faite et la page
    // re-rendue. Sans cette attente, l'acheteur valide avant la dépublication, la commande
    // réussit, et le test échoue en cherchant une alerte qui n'a aucune raison d'exister.
    await expect(page.getByRole("button", { name: "Publier", exact: true })).toBeVisible();

    await buyer.getByLabel("Nom du destinataire").fill("Awa Diop");
    await buyer.getByLabel("Téléphone").fill("+32470000000");
    await buyer.getByLabel("Adresse").fill("12 rue des Artisans");
    await buyer.getByLabel("Ville").fill("Bruxelles");
    await buyer.getByLabel("Pays (code à deux lettres)").fill("BE");
    await buyer.getByRole("button", { name: "Confirmer la commande" }).click();

    // Refusé, nommé, et SANS commande créée.
    await expect(buyer.locator("main p[role='alert']")).toContainText("n'est plus disponible");
    await buyer.goto(`${URL_STOREFRONT}/orders`);
    await expect(inMain(buyer, "Vous n'avez encore passé aucune commande.")).toBeVisible();

    await buyerContext.close();
});
