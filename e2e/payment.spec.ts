import {
    expect,
    test,
    type Browser,
    type BrowserContext,
    type Locator,
    type Page,
} from "@playwright/test";
import { URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import {
    acceptPaymentMethods,
    createApprovedVendorShop,
    createVerifiedAccount,
    publishProduct,
    signInFromPage,
} from "./helpers/accounts";

// L'annonceur de route de Next porte le titre de la page hors de `main`, et le titre d'une
// fiche EST le nom du produit. Un `getByText` non restreint en trouve donc deux. Piège
// consigné dans `docs/pieges.md`.
function inMain(page: Page, text: string): Locator {
    return page.locator("main").getByText(text);
}

// L'état du paiement de la COMMANDE, côté acheteur, lu dans son paragraphe.
//
// Le même mot se lit deux fois dès qu'une tentative existe : dans ce paragraphe, et dans la
// ligne de la trace. `getByText("Payé")` en trouverait deux, et Playwright refuse alors de
// choisir. Le texte est aussi comparé en ENTIER : `getByText` cherche une sous-chaîne sans
// tenir compte de la casse, donc « Reçu » matcherait « Reçue », le statut de la commande.
function orderPayment(page: Page, label: string): Locator {
    return page
        .locator("main")
        .getByRole("paragraph")
        .filter({ hasText: new RegExp(`^${label}$`, "u") });
}

// L'état du paiement côté vendeur, lu dans son propre `span`. « Reçu » est le mot du
// vendeur : recevoir l'argent est son point de vue. Le texte est comparé en ENTIER, car la
// page porte aussi « Reçue » (statut de la commande) et le bouton « Paiement reçu ».
function vendorPayment(page: Page, label: string): Locator {
    return page.locator("main").getByText(label, { exact: true });
}

// Sériel : le premier test amorce l'administrateur, que les autres trouvent déjà là.
test.describe.configure({ mode: "serial" });

// Ces parcours traversent trois applications et l'API, créent un produit avec photo qui passe
// par le worker d'images, et vont jusqu'au règlement.
test.setTimeout(240_000);

// Pose la devise de la boutique : sans elle, aucun prix ne se saisit.
async function chooseCurrency(page: Page): Promise<void> {
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();
}

// L'acheteur : un contexte à lui, car deux sessions dans un même contexte se partageraient
// le cookie. Son compte est créé depuis CE contexte, et non celui du vendeur : ce dernier a
// déjà suivi un lien de vérification, donc il porte une session, et Better Auth y refuse
// toute écriture sans en-tête `Origin`.
async function signedInBuyer(
    browser: Browser,
    suffix: number,
): Promise<{ context: BrowserContext; buyer: Page }> {
    const context = await browser.newContext();
    const buyer = await context.newPage();
    const address = `acheteur-paiement-${suffix}@exemple.test`;
    await createVerifiedAccount(context.request, address);
    await signInFromPage(buyer, address);
    return { context, buyer };
}

// Du catalogue au panier, par le chemin que l'acheteur emprunte vraiment.
async function addToCart(buyer: Page, title: string): Promise<void> {
    await buyer.goto(`${URL_STOREFRONT}/catalog`);
    await inMain(buyer, title).click();
    await buyer.waitForURL(/\/shops\/[^/]+\/[^/]+$/);
    await buyer.getByRole("button", { name: "Ajouter au panier" }).click();
    await expect(buyer.getByRole("status")).toContainText("Ajouté à votre panier");
}

// Du panier à l'écran de validation, adresse saisie. Les méthodes, elles, sont choisies par
// chaque parcours : c'est ce qui les distingue.
async function startCheckout(buyer: Page): Promise<void> {
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
}

// La validation redirige vers la commande, dont l'URL porte la référence.
async function readReference(buyer: Page): Promise<string> {
    await buyer.waitForURL(/\/orders\/CMD-/);
    const reference = (await buyer.getByRole("heading", { level: 1 }).textContent()) ?? "";
    expect(reference).toContain("CMD-");
    return reference;
}

// La page du simulateur est servie par l'API, donc sur une AUTRE origine que la vitrine, et
// c'est ce qui distingue l'aller (le fournisseur) du retour (la commande). L'adresse de la
// commande figure aussi, ENCODÉE, dans la requête du simulateur : un motif sur l'URL entière
// ne dirait pas où l'on est.
function onSimulator(url: URL): boolean {
    return url.pathname.startsWith("/payments/simulator/");
}

function onOrderPage(url: URL): boolean {
    return (
        url.origin === new URL(URL_STOREFRONT).origin && url.pathname.includes("/orders/CMD-")
    );
}

test("un vendeur choisit ses paiements, l'acheteur règle hors ligne, le vendeur pointe", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const title = `Sac payé à la livraison ${suffix}`;

    const { shopName } = await createApprovedVendorShop(page, request, browser);
    await chooseCurrency(page);
    // Le produit est publié AVANT que la boutique accepte quoi que ce soit : c'est ce qui
    // permet de constater qu'il n'est pas au catalogue, puis qu'il y apparaît.
    await publishProduct(page, title, "45");

    const { context, buyer } = await signedInBuyer(browser, suffix);
    await buyer.goto(`${URL_STOREFRONT}/catalog`);
    await expect(inMain(buyer, title)).toHaveCount(0);

    // La phrase qui dit la règle est PERMANENTE : visible avant de cocher quoi que ce soit,
    // et toujours là une fois les cases cochées. Une alerte qui n'apparaîtrait qu'à la
    // dernière case décochée arriverait après la décision qu'elle devait éclairer.
    await page.goto(`${URL_VENDOR}/shop`);
    const rule = page.getByText(
        "Votre boutique doit accepter au moins un paiement. Sans aucun, elle n'apparaît pas dans le catalogue, et ses articles non plus.",
    );
    await expect(rule).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Carte bancaire" })).not.toBeChecked();

    await acceptPaymentMethods(page, ["Paiement à la livraison", "Carte bancaire"]);
    await expect(rule).toBeVisible();

    // Ce que la case a produit : la boutique, donc son article, entre au catalogue.
    await buyer.reload();
    await expect(inMain(buyer, title)).toBeVisible();

    await addToCart(buyer, title);
    await startCheckout(buyer);

    // La boutique accepte DEUX méthodes, et l'écran n'en propose pas une troisième. Aucune
    // n'est présélectionnée : choisir pour quelqu'un comment il paie se paie en litige.
    const group = buyer.getByRole("group", { name: `Comment payer ${shopName}` });
    await expect(group.getByRole("radio", { name: "Paiement à la livraison" })).not.toBeChecked();
    await expect(group.getByRole("radio", { name: "Carte bancaire" })).not.toBeChecked();
    await expect(group.getByRole("radio", { name: "Virement bancaire" })).toHaveCount(0);

    await buyer.getByRole("button", { name: "Confirmer la commande" }).click();
    await expect(buyer.locator("main p[role='alert']")).toContainText(
        "Choisissez un paiement pour chaque boutique.",
    );

    await group.getByRole("radio", { name: "Paiement à la livraison" }).check();
    await buyer.getByRole("button", { name: "Confirmer la commande" }).click();
    const reference = await readReference(buyer);

    // Hors ligne, rien ne se règle sur la plateforme : l'acheteur lit comment joindre la
    // boutique, et aucun bouton de paiement ne lui est offert.
    await expect(orderPayment(buyer, "En attente")).toBeVisible();
    await expect(inMain(buyer, "Contact de la boutique")).toBeVisible();
    await expect(buyer.getByRole("button", { name: "Payer", exact: true })).toHaveCount(0);

    // LE VENDEUR la voit impayée. L'écran le dit, et n'empêche rien : le bouton d'avancement
    // reste ouvert, parce que le vendeur connaît peut-être son client.
    await page.goto(`${URL_VENDOR}/orders`);
    await inMain(page, reference).click();
    await page.waitForURL(/\/orders\/[^/]+$/);
    await expect(vendorPayment(page, "En attente")).toBeVisible();
    await expect(inMain(page, "Le paiement de cette commande n'est pas arrivé.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accepter" })).toBeEnabled();

    await page.getByRole("button", { name: "Paiement reçu" }).click();

    // On attend ce que l'action a PRODUIT : « Reçu », en entier, que rien d'autre sur la
    // page ne porte avant le clic.
    await expect(vendorPayment(page, "Reçu")).toBeVisible();
    await expect(inMain(page, "Pointé par")).toBeVisible();
    await expect(page.getByRole("button", { name: "Paiement reçu" })).toHaveCount(0);
    await expect(inMain(page, "Le paiement de cette commande n'est pas arrivé.")).toHaveCount(0);

    // L'acheteur lit le même état : la page est rendue par le serveur, donc se recharge.
    await buyer.reload();
    await expect(orderPayment(buyer, "Payé")).toBeVisible();
    await expect(buyer.getByTestId("tentative")).toHaveCount(1);

    await context.close();
});

test("un acheteur paie en ligne : un refus laisse sa trace, et il réessaie jusqu'au paiement", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const title = `Sac payé en ligne ${suffix}`;

    const { shopName } = await createApprovedVendorShop(page, request, browser);
    await chooseCurrency(page);
    await acceptPaymentMethods(page, ["Paiement à la livraison", "Carte bancaire"]);
    await publishProduct(page, title, "45");

    const { context, buyer } = await signedInBuyer(browser, suffix);
    await addToCart(buyer, title);
    await startCheckout(buyer);

    const group = buyer.getByRole("group", { name: `Comment payer ${shopName}` });
    await group.getByRole("radio", { name: "Carte bancaire" }).check();
    await buyer.getByRole("button", { name: "Confirmer la commande" }).click();
    const reference = await readReference(buyer);

    // Rien n'a encore été tenté : le paiement attend, et la trace est vide.
    await expect(orderPayment(buyer, "En attente")).toBeVisible();
    await expect(buyer.getByTestId("tentative")).toHaveCount(0);

    // Côté vendeur, un paiement en ligne ne se pointe PAS à la main : là, seul le
    // fournisseur dit ce qui s'est passé. L'écran le dit, et n'offre pas le bouton.
    await page.goto(`${URL_VENDOR}/orders`);
    await inMain(page, reference).click();
    await page.waitForURL(/\/orders\/[^/]+$/);
    await expect(
        inMain(page, "Un paiement en ligne se règle chez le fournisseur"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Paiement reçu" })).toHaveCount(0);

    // L'aller chez le fournisseur : le simulateur vit sur l'API, donc une autre origine, et
    // ce clic ne revient que par le retour qu'il déclenche.
    await buyer.getByRole("button", { name: "Payer", exact: true }).click();
    await buyer.waitForURL(onSimulator);

    await buyer.getByRole("button", { name: "Échouer" }).click();
    await buyer.waitForURL(onOrderPage);

    // Un échec n'est pas une fin : la tentative reste dans la trace, et le bouton propose de
    // recommencer. C'est l'ACTION qui les a produits, aucun des deux n'était à l'écran avant.
    await expect(orderPayment(buyer, "Refusé")).toBeVisible();
    await expect(buyer.getByTestId("tentative")).toHaveCount(1);
    await expect(buyer.getByTestId("tentative")).toContainText("Refusé");

    await buyer.getByRole("button", { name: "Réessayer le paiement" }).click();
    await buyer.waitForURL(onSimulator);

    await buyer.getByRole("button", { name: "Payer", exact: true }).click();
    await buyer.waitForURL(onOrderPage);
    await expect(orderPayment(buyer, "Payé")).toBeVisible();

    // Les DEUX tentatives sont là, la refusée et la réglée : c'est ce qu'une enquête cherche.
    // Une commande réglée n'offre plus de quoi payer.
    await expect(buyer.getByTestId("tentative")).toHaveCount(2);
    await expect(buyer.getByTestId("tentative").filter({ hasText: "Refusé" })).toHaveCount(1);
    await expect(buyer.getByTestId("tentative").filter({ hasText: "Payé" })).toHaveCount(1);
    await expect(
        buyer.getByRole("button", { name: /Payer|Réessayer/u }),
    ).toHaveCount(0);

    // Le vendeur lit le même résultat sans avoir rien pointé : la trace nomme les deux
    // tentatives, et aucune ne porte de nom de pointeur, puisqu'aucune main ne l'a fait.
    await page.reload();
    await expect(vendorPayment(page, "Reçu")).toBeVisible();
    await expect(inMain(page, "Carte bancaire · Refusé")).toBeVisible();
    await expect(inMain(page, "Carte bancaire · Reçu")).toBeVisible();
    await expect(inMain(page, "Pointé par")).toHaveCount(0);

    await context.close();
});
