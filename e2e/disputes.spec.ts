import { expect, test, type Locator, type Page } from "@playwright/test";
import { URL_ADMIN, URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import {
    acceptPaymentMethods,
    createApprovedVendorShop,
    createVerifiedAccount,
    expectSubjectFor,
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
// worker d'images, et attend plusieurs courriels.
test.setTimeout(240_000);

// Une action serveur suivie d'une revalidation et d'un re-rendu dépasse cinq secondes quand
// la suite entière charge la machine : mesuré sur les parcours de modération et de
// suspension. Allonger ne masque rien, l'écran ne changerait jamais sans l'action.
const AFTER_ACTION = { timeout: 30_000 };

// Du catalogue à la commande passée, par le chemin de l'acheteur. Rend la référence.
async function placeOrder(buyer: Page, title: string): Promise<string> {
    await buyer.goto(`${URL_STOREFRONT}/catalog`);
    await inMain(buyer, title).click();
    await buyer.waitForURL(/\/shops\/[^/]+\/[^/]+$/);
    await buyer.getByRole("button", { name: "Ajouter au panier" }).click();
    await expect(buyer.getByRole("status")).toContainText("Ajouté à votre panier");

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

test("un acheteur conteste une commande expédiée, l'administration lui donne raison, et il se déclare servi", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const title = `Bague contestée ${suffix}`;
    const buyerAddress = `litige-${suffix}@exemple.test`;

    // La boutique : sa devise, un paiement accepté, un produit publié.
    const { address: vendorAddress } = await createApprovedVendorShop(page, request, browser);
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();
    await acceptPaymentMethods(page, ["Paiement à la livraison"]);
    await publishProduct(page, title, "120,00");

    const buyerContext = await browser.newContext();
    const buyer = await buyerContext.newPage();
    await createVerifiedAccount(buyerContext.request, buyerAddress);
    await signInFromPage(buyer, buyerAddress);

    const reference = await placeOrder(buyer, title);

    // Avant l'expédition, rien à contester : le lien n'existe pas encore.
    await expect(buyer.getByRole("link", { name: "Signaler un problème" })).toHaveCount(0);

    // LE VENDEUR accepte, puis expédie. On attend la DISPARITION du bouton, jamais le mot
    // « Expédiée », que « Marquer expédiée » porte déjà : piège consigné dans `docs/pieges.md`.
    await page.goto(`${URL_VENDOR}/orders`);
    await inMain(page, reference).click();
    await page.waitForURL(/\/orders\/[^/]+$/);
    await page.getByRole("button", { name: "Accepter" }).click();
    await expect(page.getByRole("button", { name: "Marquer expédiée" })).toBeVisible(AFTER_ACTION);
    await page.getByRole("button", { name: "Marquer expédiée" }).click();
    await expect(page.getByRole("button", { name: "Marquer expédiée" })).toBeHidden(AFTER_ACTION);
    const vendorOrderUrl = page.url();

    // L'ACHETEUR ouvre le litige, avec une photo.
    await buyer.goto(`${URL_STOREFRONT}/orders/${reference}`);
    await buyer.getByRole("link", { name: "Signaler un problème" }).click();
    await buyer.waitForURL(/\/dispute$/);
    await buyer.waitForLoadState("networkidle");
    await buyer.getByRole("checkbox", { name: new RegExp(title) }).check();
    await buyer.getByRole("combobox", { name: "Motif" }).selectOption({ label: "Arrivé abîmé" });
    await buyer.getByLabel("Ce qui s'est passé").fill("Le chaton de la bague est arrivé fendu.");

    // Quatre pièces sont refusées DANS LE NAVIGATEUR, avant l'envoi : au-delà de 16 Mo, Next
    // refuserait le corps de l'action sans qu'elle tourne, et l'acheteur perdrait sa page.
    const preuves = buyer.getByLabel("Preuves", { exact: false });
    const photo = (name: string) => ({ name, mimeType: "image/jpeg", buffer: Buffer.from("jpeg") });
    await preuves.setInputFiles([photo("a.jpg"), photo("b.jpg"), photo("c.jpg"), photo("d.jpg")]);
    await expect(preuves).toHaveJSProperty("validationMessage", "Joignez 3 pièces au plus.");

    await preuves.setInputFiles("e2e/fixtures/product.jpg");
    await expect(preuves).toHaveJSProperty("validationMessage", "");
    // Un SECOND onglet ouvre le litige le premier. Le formulaire du premier sera refusé, et
    // l'acheteur ne doit pas perdre ce qu'il a écrit : React vide un formulaire dès que son
    // action se termine, refus compris.
    const racer = await buyerContext.newPage();
    await racer.goto(`${URL_STOREFRONT}/orders/${reference}/dispute`);
    await racer.waitForLoadState("networkidle");
    await racer.getByRole("checkbox", { name: new RegExp(title) }).check();
    await racer.getByRole("combobox", { name: "Motif" }).selectOption({ label: "Arrivé abîmé" });
    await racer.getByLabel("Ce qui s'est passé").fill("Bague reçue avec le chaton fendu.");
    await racer.getByLabel("Preuves", { exact: false }).setInputFiles("e2e/fixtures/product.jpg");
    await racer.getByRole("button", { name: "Ouvrir le litige" }).click();
    await racer.waitForURL(/\/dispute\?notice=opened$/, AFTER_ACTION);
    await expect(racer.getByRole("status")).toContainText("Votre litige est ouvert");
    await racer.close();

    await buyer.getByRole("button", { name: "Ouvrir le litige" }).click();
    await expect(buyer.locator("main").getByRole("alert")).toContainText("Un litige existe déjà", AFTER_ACTION);
    await expect(buyer.getByLabel("Ce qui s'est passé")).toHaveValue("Le chaton de la bague est arrivé fendu.");
    await expect(buyer.getByRole("combobox", { name: "Motif" })).toHaveValue("DAMAGED");
    await expect(buyer.getByRole("checkbox", { name: new RegExp(title) })).toBeChecked();

    await buyer.goto(`${URL_STOREFRONT}/orders/${reference}/dispute`);
    await expect(buyer.getByTestId("dispute-status")).toHaveText("En cours");
    // L'acheteur relit ce qu'il conteste : le motif et les articles désignés.
    await expect(buyer.getByTestId("dispute-reason")).toHaveText("Arrivé abîmé");
    await expect(buyer.getByTestId("dispute-lines")).toContainText(title);

    // La boutique est prévenue par courriel.
    await expectSubjectFor(request, vendorAddress, `conteste la commande ${reference}`);

    // LE VENDEUR ouvre la preuve de l'acheteur par la route gardée de l'espace vendeur, puis
    // répond depuis la commande, avec sa propre pièce.
    await page.goto(vendorOrderUrl);
    await expect(page.getByTestId("dispute-status")).toHaveText("En cours");
    const preuveAcheteur = (await page.getByRole("link", { name: "product.jpg" }).getAttribute("href")) ?? "";
    const vueVendeur = await page.request.get(`${URL_VENDOR}${preuveAcheteur}`);
    expect(vueVendeur.status()).toBe(200);
    expect(vueVendeur.headers()["content-type"]).toBe("image/jpeg");

    await page.getByLabel("Votre réponse").fill("Nous renvoyons une bague neuve dès demain.");
    await page.getByLabel("Preuves", { exact: false }).setInputFiles("e2e/fixtures/registry.pdf");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByTestId("dispute-message")).toHaveCount(2, AFTER_ACTION);

    // L'acheteur voit la réponse, et les deux pièces s'ouvrent par la route gardée de la
    // boutique : la sienne, et celle du vendeur.
    await buyer.reload();
    await expect(inMain(buyer, "Nous renvoyons une bague neuve dès demain.")).toBeVisible();
    const href = (await buyer.getByRole("link", { name: "product.jpg" }).getAttribute("href")) ?? "";
    const reponse = await buyerContext.request.get(`${URL_STOREFRONT}${href}`);
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()["content-type"]).toBe("image/jpeg");
    const hrefVendeur = (await buyer.getByRole("link", { name: "registry.pdf" }).getAttribute("href")) ?? "";
    const pieceVendeur = await buyerContext.request.get(`${URL_STOREFRONT}${hrefVendeur}`);
    expect(pieceVendeur.status()).toBe(200);
    expect(pieceVendeur.headers()["content-type"]).toBe("application/pdf");

    // La boutique commence une seconde réponse, que la décision va rendre caduque.
    await page.goto(vendorOrderUrl);
    await page.getByLabel("Votre réponse").fill("Une dernière précision sur l'envoi.");

    // L'ADMINISTRATION tranche sans attendre les sept jours de silence.
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await signInAsAdministrator(admin);
    await admin.goto(`${URL_ADMIN}/disputes`);
    await admin.getByRole("link", { name: reference }).click();
    await admin.waitForURL(/\/disputes\/[^/]+$/);
    await admin.waitForLoadState("networkidle");
    // La pièce s'ouvre aussi pour l'administration, par sa propre route.
    const adminHref = (await admin.getByRole("link", { name: "product.jpg" }).getAttribute("href")) ?? "";
    expect((await adminContext.request.get(`${URL_ADMIN}${adminHref}`)).status()).toBe(200);

    await admin.getByRole("combobox", { name: "Issue" }).selectOption({ label: "Donner raison à l'acheteur" });
    await admin.getByLabel("Commentaire, lu par les deux parties").fill("La photo montre un chaton fendu.");
    await admin.getByRole("button", { name: "Trancher" }).click();
    await admin.waitForURL(/\?notice=decided$/, AFTER_ACTION);
    await expect(admin.getByRole("status")).toContainText("les deux parties ont été prévenues");
    await expect(admin.getByTestId("dispute-status")).toHaveText("Tranché pour l'acheteur");
    // Tranché : le formulaire de décision n'est plus rendu.
    await expect(admin.getByRole("button", { name: "Trancher" })).toHaveCount(0);

    // Envoyée après la décision, la réponse de la boutique est refusée, et elle garde ce
    // qu'elle a écrit.
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Ce litige a changé", AFTER_ACTION);
    await expect(page.getByLabel("Votre réponse")).toHaveValue("Une dernière précision sur l'envoi.");

    // Tranché contre elle, la commande reste signalée dans la liste de la boutique : elle a
    // encore un client à servir.
    await page.goto(`${URL_VENDOR}/orders`);
    await expect(page.getByTestId(`dispute-badge-${reference}`)).toHaveText("Litige tranché : client à servir");

    // Les deux parties reçoivent la décision.
    await expectSubjectFor(request, buyerAddress, "décision en votre faveur");
    await expectSubjectFor(request, vendorAddress, "décision en faveur du client");

    // L'ACHETEUR lit la décision, puis se déclare servi.
    await buyer.goto(`${URL_STOREFRONT}/orders/${reference}/dispute`);
    await expect(buyer.getByTestId("dispute-status")).toHaveText("Tranché en votre faveur");
    await expect(inMain(buyer, "La photo montre un chaton fendu.")).toBeVisible();
    // Tranché : on ne répond plus, on ne peut que se déclarer servi.
    await expect(buyer.getByLabel("Votre réponse")).toHaveCount(0);
    // Se déclarer servi clôt le litige pour de bon : l'écran demande une confirmation, et un
    // clic seul ne suffit pas.
    const servi = buyer.locator("summary", { hasText: "J'ai été servi" });
    const confirmer = buyer.getByRole("button", { name: "Oui, j'ai été servi" });
    await expect(confirmer).toBeHidden();
    await servi.click();
    await confirmer.click();
    await expect(servi).toBeHidden(AFTER_ACTION);
    await expect(buyer.getByTestId("dispute-status")).toHaveText("Servi");

    await buyerContext.close();
    await adminContext.close();
});
