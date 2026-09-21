import { expect, test } from "@playwright/test";
import { URL_VENDOR } from "../playwright.config";
import { createApprovedVendorShop } from "./helpers/accounts";

// Sériel : le premier test amorce l'administrateur, que les autres trouvent déjà là.
test.describe.configure({ mode: "serial" });

// Ce parcours traverse trois applications et une dizaine d'écrans, dont plusieurs sont
// compilés à la demande au premier passage.
test.setTimeout(180_000);

// `getByRole` avec un nom accessible plutôt que `getByLabel` : `Field` enveloppe son
// contrôle dans le `<label>`, et Playwright compare le texte du label par SOUS-CHAÎNE.
// Une description qui contiendrait « Taille » ferait correspondre deux éléments.
test("un vendeur déclare sa devise, crée un produit, le décline et le publie", async ({
    page,
    request,
    browser,
}) => {
    await createApprovedVendorShop(page, request, browser);

    // Critère 1 : sans devise, on ne fixe aucun prix — la liste renvoie vers la boutique.
    await page.goto(`${URL_VENDOR}/products`);
    await page.waitForURL(`${URL_VENDOR}/shop`);

    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("EUR");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await page.goto(`${URL_VENDOR}/products`);
    await expect(page.getByText("Vous n'avez pas encore de produit.")).toBeVisible();

    await page.getByRole("link", { name: "Nouveau produit" }).click();
    await page.getByRole("textbox", { name: "Titre" }).fill("Tee-shirt en lin");
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Lin lavé tissé en Europe, coupe droite, col rond, coutures renforcées.");
    await page.getByRole("textbox", { name: "Prix", exact: true }).fill("49,00");
    await page.getByRole("button", { name: "Créer le produit" }).click();

    await page.waitForURL(/\/products\/[^/]+$/);

    // Critère 2 : sans axe, un seul champ de prix — et le mot « déclinaison » n'est le
    // libellé d'aucune ligne de grille.
    await expect(page.getByText("Brouillon")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Prix", exact: true })).toHaveValue("49,00");

    // Critère 3 : trois valeurs, trois variantes, toutes au prix courant.
    await page.getByRole("button", { name: "Ajouter un axe" }).click();
    await page.getByRole("textbox", { name: "Nom de l'axe" }).fill("Taille");
    await page.getByRole("textbox", { name: "Valeurs, séparées par une virgule" }).fill("S, M, L");

    for (const size of ["S", "M", "L"]) {
        await expect(page.getByRole("textbox", { name: size, exact: true })).toHaveValue("49,00");
    }

    await page.getByRole("textbox", { name: "L", exact: true }).fill("55,00");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Votre produit est enregistré.")).toBeVisible();

    // Rechargée, la grille doit rendre ce qui a été écrit : sans ce passage, une action
    // qui affiche « enregistré » sans rien écrire passerait aussi.
    await page.reload();
    await expect(page.getByRole("textbox", { name: "L", exact: true })).toHaveValue("55,00");
    await expect(page.getByRole("textbox", { name: "S", exact: true })).toHaveValue("49,00");

    // Critère 6 : la publication est un geste explicite.
    await page.getByRole("button", { name: "Publier" }).click();
    await expect(page.getByText("Publié")).toBeVisible();

    // Critère 8 : la devise ne se change plus.
    await page.goto(`${URL_VENDOR}/shop`);
    await expect(page.getByRole("combobox", { name: "Devise des prix" })).toBeDisabled();

    await page.goto(`${URL_VENDOR}/products`);
    await expect(page.getByRole("link", { name: /Tee-shirt en lin/ })).toBeVisible();
    await expect(page.getByText("3 déclinaisons")).toBeVisible();
});

// Critère 4 : retirer une valeur n'emporte que ses variantes.
test("retirer une valeur ne touche pas aux autres déclinaisons", async ({
    page,
    request,
    browser,
}) => {
    await createApprovedVendorShop(page, request, browser);

    await page.goto(`${URL_VENDOR}/shop`);
    await page.getByRole("combobox", { name: "Devise des prix" }).selectOption("XOF");
    await page.getByRole("button", { name: "Enregistrer la devise" }).click();
    await expect(page.getByText("Votre devise est enregistrée.")).toBeVisible();

    await page.goto(`${URL_VENDOR}/products/new`);
    await page.getByRole("textbox", { name: "Titre" }).fill("Bracelet tressé");
    await page
        .getByRole("textbox", { name: "Description" })
        .fill("Cuir tressé à la main, fermoir en laiton massif, taille ajustable.");
    // Le franc CFA n'a AUCUNE décimale : un montant qui en porterait serait refusé.
    await page.getByRole("textbox", { name: "Prix", exact: true }).fill("12000");
    await page.getByRole("button", { name: "Créer le produit" }).click();
    await page.waitForURL(/\/products\/[^/]+$/);

    await page.getByRole("button", { name: "Ajouter un axe" }).click();
    await page.getByRole("textbox", { name: "Nom de l'axe" }).fill("Longueur");
    await page
        .getByRole("textbox", { name: "Valeurs, séparées par une virgule" })
        .fill("16 cm, 18 cm");
    await page.getByRole("textbox", { name: "18 cm", exact: true }).fill("14000");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Votre produit est enregistré.")).toBeVisible();

    await page.reload();
    await page
        .getByRole("textbox", { name: "Valeurs, séparées par une virgule" })
        .fill("16 cm");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.getByText("Votre produit est enregistré.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("textbox", { name: "16 cm", exact: true })).toHaveValue("12000");
    await expect(page.getByRole("textbox", { name: "18 cm", exact: true })).toHaveCount(0);
});
