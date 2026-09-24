import { expect, test } from "@playwright/test";
import { URL_VENDOR } from "../playwright.config";
import { createApprovedVendorShop } from "./helpers/accounts";

// Sériel : le premier test amorce l'administrateur, que les suivants trouvent déjà là.
test.describe.configure({ mode: "serial" });

// Ce parcours traverse trois applications, une file et un binaire natif, et plusieurs
// écrans sont compilés à la demande au premier passage.
test.setTimeout(180_000);

test("un vendeur dépose une photo, attend son traitement, puis publie", async ({
    page,
    request,
    browser,
}) => {
    await createApprovedVendorShop(page, request, browser);

    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await page.goto(`${URL_VENDOR}/products/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill("Sac cabas en cuir");
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Cuir pleine fleur tanné végétal, coutures à la main, doublure en lin.");
    await page.getByRole("textbox", { name: "Prix", exact: true }).fill("180,00");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL(/\/products\/[^/]+$/);

    // Critère 7 : publier sans photo est refusé, le produit reste en brouillon, et le
    // vendeur LIT pourquoi. Sans ce dernier point, le bouton est indiscernable d'une
    // panne : il ne se passe rien et rien ne l'explique.
    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Brouillon")).toBeVisible();
    await expect(page.locator("main p[role='alert']")).toContainText("au moins une photo");

    // Le fichier traverse la server action : le stockage n'expose aucun en-tête CORS, un
    // dépôt direct depuis le navigateur est donc impossible sans proxy devant lui.
    await page.getByLabel("Ajouter des photos").setInputFiles("e2e/fixtures/product.jpg");

    // Le traitement est asynchrone et la page se rafraîchit d'elle-même. On attend que
    // la vignette EXISTE plutôt qu'un délai arbitraire — un délai fixe serait vert sur
    // une machine rapide et rouge en intégration continue.
    //
    // `data-testid` et non `getByRole("img")` : ce rôle attrape aussi toute icône SVG de
    // la page, et un faux positif ferait passer le test alors que rien n'a été traité.
    await expect(page.getByTestId("vignette")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Publié")).toBeVisible();

    // Une fiche EN LIGNE garde au moins une photo : la publication ne contrôle les images
    // qu'une fois, et sans ce refus le vendeur laisserait une fiche publiée sans aucune
    // image — la garantie même sur laquelle T2d s'appuie. On refuse plutôt que de
    // dépublier dans son dos, et on lui dit quoi faire.
    await page.getByRole("button", { name: "Supprimer" }).click();
    await expect(page.locator("main p[role='alert']")).toContainText("Dépubliez d'abord");
    await expect(page.getByTestId("vignette")).toBeVisible();
    await expect(page.getByText("Publié")).toBeVisible();
});

test("une image illisible est signalée, pas escamotée, et bloque la publication", async ({
    page,
    request,
    browser,
}) => {
    await createApprovedVendorShop(page, request, browser);

    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await page.goto(`${URL_VENDOR}/products/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill("Bracelet tressé");
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Cuir tressé à la main, fermoir en laiton massif, taille ajustable.");
    await page.getByRole("textbox", { name: "Prix", exact: true }).fill("45,00");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL(/\/products\/[^/]+$/);

    // Un fichier qui PRÉTEND être une image : extension `.jpg`, donc type `image/jpeg`
    // annoncé par le navigateur. Il franchit le contrôle de l'action — qui ne peut que
    // croire ce que le navigateur déclare — et n'est démasqué que par le worker, en le
    // décodant. C'est le seul chemin qui produit un `FAILED`.
    //
    // Un `.txt` serait refusé plus tôt, par l'action, et ne prouverait pas ce cas-ci.
    await page.getByLabel("Ajouter des photos").setInputFiles("e2e/fixtures/corrupt.jpg");

    await expect(page.getByText("Ce fichier n'est pas une image lisible.")).toBeVisible({
        timeout: 60_000,
    });

    // Critère 5 : elle reste visible, avec sa raison — mais SANS « Réessayer ». Le worker
    // a supprimé l'original en la refusant : relancer retrouverait un objet absent et
    // échouerait pour une autre raison. Le libellé dit à la place quoi faire, et
    // « Supprimer » est à portée de clic.
    await expect(page.getByRole("button", { name: "Réessayer" })).toHaveCount(0);
    await expect(page.getByText("Supprimez-la et déposez-en une autre.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Supprimer" })).toBeVisible();

    // Critère 7 : elle bloque la publication, et le vendeur LIT pourquoi.
    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Brouillon")).toBeVisible();
    await expect(page.locator("main p[role='alert']")).toContainText("au moins une photo");
});
