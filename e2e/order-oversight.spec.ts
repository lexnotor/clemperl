import { expect, test, type Locator, type Page } from "@playwright/test";
import { URL_ADMIN, URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import {
    acceptPaymentMethods,
    createApprovedVendorShop,
    createVerifiedAccount,
    publishProduct,
    signInAsAdministrator,
    signInFromPage,
} from "./helpers/accounts";

// L'annonceur de route de Next porte le titre de la page hors de `main`. Un `getByText` non
// restreint en trouve donc deux. Piège consigné dans `docs/pieges.md`.
function inMain(page: Page, text: string): Locator {
    return page.locator("main").getByText(text);
}

// Ce parcours traverse trois applications, crée un produit avec photo qui passe par le
// worker d'images, et passe deux commandes.
test.setTimeout(240_000);

// Les boutons d'action de l'administration, par leur libellé exact. Les mêmes sélecteurs
// servent à constater la présence ET l'absence : une absence seule passerait à vide le jour
// où un libellé change.
function action(page: Page, name: string): Locator {
    return page.getByRole("button", { name, exact: true });
}

// Du catalogue à la commande passée, par le chemin de l'acheteur. Rend la référence.
async function placeOrder(buyer: Page, title: string): Promise<string> {
    await buyer.goto(`${URL_STOREFRONT}/catalog`);
    await inMain(buyer, title).click();
    await buyer.waitForURL(/\/shops\/[^/]+\/[^/]+$/);
    await buyer.getByRole("button", { name: "Ajouter au panier" }).click();
    await expect(buyer.getByRole("main").getByRole("status")).toContainText("Ajouté à votre panier");

    await buyer.goto(`${URL_STOREFRONT}/cart`);
    await buyer.getByRole("link", { name: "Passer commande" }).click();
    await buyer.waitForURL(/\/checkout$/);
    // Taper dans un DOM que React va remplacer perd la saisie. Piège consigné dans
    // `docs/pieges.md`.
    await buyer.waitForLoadState("networkidle");

    await buyer.getByLabel("Nom du destinataire").fill("Awa Diop");
    await buyer.getByLabel("Téléphone").fill("+32470000000");
    await buyer.getByLabel("Adresse").fill("12 rue des Artisans");
    await buyer.getByLabel("Ville").fill("Bruxelles");
    await buyer.getByLabel("Pays (code à deux lettres)").fill("BE");
    await buyer.getByRole("radio", { name: "Paiement à la livraison" }).check();
    await buyer.getByRole("button", { name: "Confirmer la commande" }).click();

    await buyer.waitForURL(/\/orders\/CMD-/);
    const reference = (await buyer.getByRole("heading", { level: 1 }).textContent()) ?? "";
    expect(reference).toContain("CMD-");
    return reference;
}

// Ouvre le détail d'une commande depuis la liste de l'administration, comme le ferait une
// personne qui cherche une référence. La liste est filtrée par l'état : sur une base qui a
// vécu, la commande ne tient pas forcément sur la première des pages de vingt lignes, et
// l'échec ressemblerait à un écran cassé plutôt qu'à une pagination.
async function openInAdministration(
    admin: Page,
    reference: string,
    status: string,
): Promise<void> {
    await admin.goto(`${URL_ADMIN}/orders?status=${status}`);
    await admin.getByRole("link", { name: new RegExp(reference) }).click();
    await admin.waitForURL(/\/orders\/[^/]+$/);
    await expect(admin.getByRole("heading", { level: 1 })).toHaveText(reference);
}

test("une commande que le vendeur laisse dormir est annulée par l'administration, et l'acheteur la voit annulée", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const title = `Sac en souffrance ${suffix}`;

    await createApprovedVendorShop(page, request, browser);
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();
    await acceptPaymentMethods(page, ["Paiement à la livraison"]);
    await publishProduct(page, title, "75,00");

    const buyerContext = await browser.newContext();
    const buyer = await buyerContext.newPage();
    await createVerifiedAccount(buyerContext.request, `surveillance-${suffix}@exemple.test`);
    await signInFromPage(buyer, `surveillance-${suffix}@exemple.test`);

    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signInAsAdministrator(admin);

    // PREMIÈRE COMMANDE : le vendeur ne fait rien, elle dort reçue et impayée.
    const sleeping = await placeOrder(buyer, title);
    await expect(inMain(buyer, "Reçue")).toBeVisible();

    await openInAdministration(admin, sleeping, "PLACED");
    await expect(admin.getByTestId("order-status")).toHaveText("Reçue");

    // Contrôle positif : les boutons SONT là sur une commande reçue, avec les libellés que
    // l'absence vise plus bas. Un libellé renommé casse ici au lieu de vider l'absence.
    await expect(action(admin, "Accepter")).toBeVisible();
    await expect(action(admin, "Annuler")).toBeVisible();
    // Une commande reçue ne s'expédie pas : l'étape « Accepter » ne se saute pas. Le positif de
    // cette absence est plus bas, sur la commande acceptée, avec le même sélecteur.
    await expect(action(admin, "Expédier")).toHaveCount(0);
    // Impayée : rien à avertir. Le positif est dans la seconde commande, avec le même
    // sélecteur.
    await expect(admin.getByTestId("settled-warning")).toHaveCount(0);

    // L'administration fait avancer la commande à la place du vendeur : une transition qu'aucun
    // autre parcours navigateur ne lui voit faire. On attend ce que l'action a PRODUIT, le
    // statut et le bouton qui n'existait pas avant.
    await action(admin, "Accepter").click();
    await expect(admin.getByTestId("order-status")).toHaveText("Acceptée");
    // Contrôle positif de « Expédier » : il est offert sur une commande acceptée, et « Accepter »
    // ne l'est plus.
    await expect(action(admin, "Expédier")).toBeVisible();
    await expect(action(admin, "Accepter")).toHaveCount(0);
    await expect(action(admin, "Annuler")).toBeVisible();

    await buyer.reload();
    await expect(inMain(buyer, "Acceptée")).toBeVisible();

    await action(admin, "Annuler").click();

    // On attend ce que l'action a PRODUIT : le statut change, et le bouton qu'on vient de
    // cliquer disparaît avec tous les autres, puisque l'état est terminal.
    await expect(admin.getByTestId("order-status")).toHaveText("Annulée");
    await expect(action(admin, "Annuler")).toHaveCount(0);
    await expect(action(admin, "Accepter")).toHaveCount(0);
    await expect(action(admin, "Expédier")).toHaveCount(0);

    // L'acheteur lit le même état depuis la vitrine : la page est rendue par le serveur.
    await buyer.reload();
    await expect(inMain(buyer, "Annulée")).toBeVisible();
    await expect(inMain(buyer, "Reçue")).toHaveCount(0);

    // SECONDE COMMANDE, dont le vendeur a pointé le paiement : annulable ET encaissée, la
    // seule situation où l'avertissement se rend. Seul un navigateur peut constater que la
    // page appelle la condition, car les tests unitaires ne voient que la fonction.
    const settled = await placeOrder(buyer, title);

    await page.goto(`${URL_VENDOR}/orders`);
    await inMain(page, settled).click();
    await page.waitForURL(/\/orders\/[^/]+$/);
    await page.getByRole("button", { name: "Paiement reçu" }).click();
    await expect(page.locator("main").getByText("Reçu", { exact: true })).toBeVisible();

    await openInAdministration(admin, settled, "PLACED");
    await expect(admin.getByTestId("order-status")).toHaveText("Reçue");
    const warning = admin.getByTestId("settled-warning");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("L'annuler ici ne le rembourse pas");
    // L'avertissement précède le clic : il est déjà là quand le bouton est offert.
    await expect(action(admin, "Annuler")).toBeVisible();

    await action(admin, "Annuler").click();
    await expect(admin.getByTestId("order-status")).toHaveText("Annulée");
    await expect(action(admin, "Annuler")).toHaveCount(0);
    // Plus rien à annuler, donc plus rien à avertir.
    await expect(admin.getByTestId("settled-warning")).toHaveCount(0);

    await buyer.goto(`${URL_STOREFRONT}${new URL(buyer.url()).pathname}`);
    await expect(inMain(buyer, "Annulée")).toBeVisible();

    await adminContext.close();
    await buyerContext.close();
});
