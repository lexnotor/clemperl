// Le temps réel, de bout en bout : chaque page reste ouverte, et ce qui change ailleurs y
// apparaît sans qu'on la recharge, avec une alerte.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import {
    acceptPaymentMethods,
    createApprovedVendorShop,
    createVerifiedAccount,
    publishProduct,
    signInFromPage,
} from "./helpers/accounts";
import { AFTER_EVENT, expectNotReloaded, markPage, realtimeAlert } from "./helpers/realtime";

// L'annonceur de route de Next porte le titre de la page hors de `main`, et le titre d'une
// fiche EST le nom du produit. Un `getByText` non restreint en trouve donc deux. Piège
// consigné dans `docs/pieges.md`.
function inMain(page: Page, text: string): Locator {
    return page.locator("main").getByText(text);
}

// Le statut de la commande, côté acheteur, comparé en ENTIER : `getByText` cherche une
// sous-chaîne sans tenir compte de la casse, et un statut se lirait dans toute phrase qui le
// contient.
function orderStatus(page: Page, label: string): Locator {
    return page.locator("main").getByText(label, { exact: true });
}

// L'état du paiement de la commande, lu dans son paragraphe : dès qu'une tentative existe, le
// même mot se lit aussi dans la ligne de la trace, et Playwright refuserait de choisir.
function orderPayment(page: Page, label: string): Locator {
    return page
        .locator("main")
        .getByRole("paragraph")
        .filter({ hasText: new RegExp(`^${label}$`, "u") });
}

interface IAlertRecorder {
    region: Element;
    texts: string[];
}

// Enregistre chaque texte qui paraît dans la région d'alerte, même effacé ensuite. Une absence
// lue après coup ne prouverait rien : l'alerte ne reste que quelques secondes, et une attente
// qui réessaie passe dès que la région se vide.
async function recordAlerts(page: Page): Promise<void> {
    await realtimeAlert(page).evaluate((region) => {
        const recorder: IAlertRecorder = { region, texts: [] };
        (window as Window & { alertRecorder?: IAlertRecorder }).alertRecorder = recorder;
        new MutationObserver(() => {
            const text = region.textContent ?? "";
            if (text !== "") {
                recorder.texts.push(text);
            }
        }).observe(region, { childList: true, subtree: true, characterData: true });
    });
}

// Ce que la région a montré depuis `recordAlerts`. La région doit être TOUJOURS celle de la
// page : remplacée par un nouveau rendu, elle laisserait l'observateur sur un nœud détaché, qui
// n'enregistrerait plus rien et ferait passer l'assertion à tort.
async function recordedAlerts(page: Page): Promise<string[]> {
    const recorded = await page.evaluate(() => {
        const recorder = (window as Window & { alertRecorder?: IAlertRecorder }).alertRecorder;
        return recorder === undefined
            ? null
            : { attached: recorder.region.isConnected, texts: recorder.texts };
    });
    expect(recorded, "aucun enregistreur d'alertes dans la page").not.toBeNull();
    expect(recorded?.attached, "la région d'alerte observée a quitté la page").toBe(true);
    return recorded?.texts ?? [];
}

// Ce parcours traverse trois applications et l'API, crée un produit avec photo qui passe par
// le worker d'images, et va jusqu'au règlement.
test.setTimeout(240_000);

test("le vendeur apprend la commande sur ses produits, l'acheteur la voit avancer puis se régler, sans recharger", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const title = `Sac suivi en direct ${suffix}`;

    await createApprovedVendorShop(page, request, browser);
    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();
    // Hors ligne seulement : c'est le vendeur qui pointe le paiement, plus bas.
    await acceptPaymentMethods(page, ["Paiement à la livraison"]);
    await publishProduct(page, title, "60");

    // LE VENDEUR reste sur la liste de ses produits, une page sans rapport avec les
    // commandes : c'est là qu'il doit apprendre qu'une commande arrive.
    await page.goto(`${URL_VENDOR}/products`);
    await expect(inMain(page, title)).toBeVisible();
    await markPage(page);

    // L'ACHETEUR, dans un contexte à lui : deux sessions dans un même contexte se
    // partageraient le cookie. Son compte est créé depuis CE contexte, celui du vendeur
    // ayant déjà suivi un lien de vérification.
    const buyerContext = await browser.newContext();
    const buyer = await buyerContext.newPage();
    const address = `acheteur-direct-${suffix}@exemple.test`;
    await createVerifiedAccount(buyerContext.request, address);
    await signInFromPage(buyer, address);

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

    // L'alerte du vendeur est guettée AVANT le clic, et sa phrase saisie dès qu'elle paraît :
    // elle s'efface après quelques secondes, et la redirection de l'acheteur vers sa commande
    // peut durer davantage quand la machine est chargée. La référence ne se connaît qu'après.
    const vendorAlert = realtimeAlert(page)
        .getByText(/^Nouvelle commande : /u)
        .textContent(AFTER_EVENT);
    await buyer.getByRole("button", { name: "Confirmer la commande" }).click();

    await buyer.waitForURL(/\/orders\/CMD-/);
    const reference = (await buyer.getByRole("heading", { level: 1 }).textContent()) ?? "";
    expect(reference).toContain("CMD-");

    expect(await vendorAlert).toBe(`Nouvelle commande : ${reference}.`);
    await expectNotReloaded(page);
    expect(page.url()).toBe(`${URL_VENDOR}/products`);

    // L'acheteur RESTE sur la page de sa commande, où la validation l'a mené. Sa région
    // d'alerte existe, et elle est vide : ce qui y paraîtra vient de ce qui suit.
    await expect(orderStatus(buyer, "Reçue")).toBeVisible();
    await expect(realtimeAlert(buyer)).toBeEmpty();
    await markPage(buyer);
    const orderUrl = buyer.url();

    // LE VENDEUR, dans son espace, fait avancer la commande. Sa région d'alerte est observée
    // dès son arrivée : il va agir trois fois, et ne doit être averti d'aucun de ses gestes.
    await page.goto(`${URL_VENDOR}/orders`);
    await inMain(page, reference).click();
    await page.waitForURL(/\/orders\/[^/]+$/);
    await recordAlerts(page);

    // L'alerte d'abord, la page ensuite : l'alerte paraît dès l'avis et s'efface, alors que
    // le nouveau rendu de la page peut se faire attendre.
    await page.getByRole("button", { name: "Accepter" }).click();
    await expect(realtimeAlert(buyer)).toHaveText(
        `Votre commande ${reference} a été mise à jour.`,
        AFTER_EVENT,
    );
    await expect(orderStatus(buyer, "Acceptée")).toBeVisible(AFTER_EVENT);

    // L'alerte est brève. Attendre qu'elle s'efface rend aussi la suivante, de même phrase,
    // attribuable à l'expédition et non à l'acceptation.
    await expect(realtimeAlert(buyer)).toBeEmpty(AFTER_EVENT);

    await page.getByRole("button", { name: "Marquer expédiée" }).click();
    await expect(realtimeAlert(buyer)).toHaveText(
        `Votre commande ${reference} a été mise à jour.`,
        AFTER_EVENT,
    );
    await expect(orderStatus(buyer, "Expédiée")).toBeVisible(AFTER_EVENT);

    // Le vendeur pointe le paiement reçu hors ligne : c'est l'API qui écrit, et qui émet.
    await page.getByRole("button", { name: "Paiement reçu" }).click();
    await expect(realtimeAlert(buyer)).toHaveText(
        `Le paiement de votre commande ${reference} a été mis à jour.`,
        AFTER_EVENT,
    );
    await expect(orderPayment(buyer, "Payé")).toBeVisible(AFTER_EVENT);

    // Tout cela sur la MÊME page, jamais rechargée.
    await expectNotReloaded(buyer);
    expect(buyer.url()).toBe(orderUrl);

    // Le vendeur, qui a accepté, expédié puis pointé, n'a été averti d'aucun de ses gestes :
    // `by` sert à cela. Son enregistreur est lu une seule fois, sans réessayer, après que
    // l'acheteur a reçu le dernier avis et que sa page s'est rendue : un avis part vers toutes
    // ses salles d'un même envoi, donc une alerte de trop chez le vendeur serait déjà comptée,
    // même effacée. Seul un avis arrivé après cette lecture lui échapperait.
    expect(await recordedAlerts(page)).toEqual([]);

    await buyerContext.close();
});
