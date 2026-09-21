import { expect, test } from "@playwright/test";
import { URL_ADMIN, URL_STOREFRONT, URL_VENDOR } from "../playwright.config";
import { createVerifiedAccount, signInAsAdministrator, signInFromPage } from "./helpers/accounts";

// Sériel : les tests partagent l'existence d'un administrateur, que le premier crée par
// la page d'amorçage.
test.describe.configure({ mode: "serial" });

// Ce parcours traverse trois applications et une dizaine d'écrans, dont plusieurs sont
// compilés à la demande au premier passage.
test.setTimeout(180_000);

test("un vendeur validé corrige sa boutique, et le slug ne bouge pas", async ({
    page,
    request,
    browser,
}) => {
    const suffix = Date.now();
    const address = `boutique-${suffix}@exemple.test`;
    const shopName = `Atelier ${suffix}`;

    await createVerifiedAccount(request, address);
    await signInFromPage(page, address);

    // Le dépôt passe par le VRAI formulaire : c'est le seul chemin qui crée une boutique,
    // et un raccourci par la base ne prouverait pas que la garde la retrouve.
    await page.goto(`${URL_STOREFRONT}/become-a-vendor`);
    await page.getByLabel("Nom de la boutique").fill(shopName);
    await page
        .getByLabel("Description")
        .fill("Joaillerie artisanale, pièces uniques montées à la main.");
    await page.getByLabel("Adresse e-mail de contact").fill(address);
    await page.getByLabel("Téléphone de contact").fill("+32470000000");
    await page.getByLabel("Joaillerie").check();
    await page.getByLabel("Forme juridique").fill("SRL");
    await page.getByLabel("Raison sociale").fill(`${shopName} SRL`);
    await page.getByLabel("Numéro d'enregistrement").fill("0123456789");
    await page.getByLabel("Pays (code à deux lettres)").fill("BE");
    await page.getByLabel("Registre de commerce").setInputFiles("e2e/fixtures/registry.pdf");
    await page.getByLabel("Pièce d'identité").setInputFiles("e2e/fixtures/identity.png");
    await page.getByRole("button", { name: "Déposer ma demande" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Votre demande est en cours d'examen",
    );

    // L'administrateur travaille dans un contexte SÉPARÉ : deux sessions dans le même
    // contexte partageraient le cookie et s'écraseraient.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signInAsAdministrator(adminPage);

    await adminPage.goto(`${URL_ADMIN}/applications`);
    await adminPage.getByRole("link", { name: new RegExp(shopName) }).click();
    await adminPage.getByRole("button", { name: "Accepter" }).click();

    // Attendre que l'administration CONSTATE la décision avant d'aller voir le candidat :
    // un clic ne fait que déclencher la server action, et lire trop tôt trouve un dossier
    // encore en examen. Invisible contre le serveur de développement, qui compile chaque
    // page au premier accès et laisse ainsi le temps à l'écriture d'aboutir.
    await expect(adminPage.getByText("Accepté", { exact: false })).toBeVisible();

    // Critère 3 : l'espace vendeur s'ouvre, et le légal s'y lit sans s'y éditer.
    // Critère 6, et le vrai chemin du vendeur : il revient sur sa demande, y lit qu'elle
    // est validée, et suit le lien. L'atteindre par son URL directe sauterait l'écran qui
    // promettait jusqu'ici que « l'espace vendeur ouvrira avec la prochaine tranche ».
    await page.goto(`${URL_STOREFRONT}/become-a-vendor`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(shopName);
    await page.getByRole("button", { name: "Ouvrir mon espace vendeur" }).click();
    await page.waitForURL(`${URL_VENDOR}/shop`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(shopName);
    await expect(page.getByText(`${shopName} SRL`)).toBeVisible();
    // Le légal est du texte, pas un champ : aucun contrôle ne porte ce libellé.
    await expect(page.getByLabel("Raison sociale")).toHaveCount(0);

    // Critère 4 : le nom change. Que le slug ne bouge PAS se prouve dans
    // `apps/api/test/vendor-shop.int-spec.ts` — c'est une propriété de la base, et le
    // slug n'est affiché par aucun écran de T2a.
    const renamed = `${shopName} & Cie`;
    await page.getByLabel("Nom de la boutique").fill(renamed);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Vos informations sont enregistrées.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nom de la boutique")).toHaveValue(renamed);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(renamed);

    // Critère 5 : une saisie invalide est refusée et n'écrit rien.
    //
    // Le cas est choisi pour ce que le NAVIGATEUR ne sait pas garder : `required` et
    // `minLength` bloquent une description trop courte avant même la soumission, donc
    // une telle saisie ne prouverait rien du serveur. Aucune contrainte native n'exige
    // en revanche qu'une case au moins soit cochée — c'est Zod, et lui seul, qui refuse
    // une liste de catégories vide.
    //
    // `getByRole` et non `getByLabel` : le libellé d'un contrôle enveloppé se calcule sur
    // le `textContent` du `<label>`, et `defaultValue` sur un `<textarea>` est rendu par
    // React comme CONTENU de l'élément. Le mot « Joaillerie » de la description fait donc
    // partie du libellé du textarea, et `getByLabel` en trouve deux.
    await page.getByRole("checkbox", { name: "Joaillerie" }).uncheck();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.locator("main p[role='alert']")).toHaveText("Vérifiez les champs signalés.");

    // « N'écrit rien » est la moitié qui compte : sans elle, une action qui enregistre
    // puis affiche une erreur passerait aussi.
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Joaillerie" })).toBeChecked();

    await adminContext.close();
});

test("un compte sans boutique est renvoyé vers la candidature, pas vers un 404", async ({
    page,
    request,
}) => {
    const address = `sansboutique-${Date.now()}@exemple.test`;
    await createVerifiedAccount(request, address);
    await signInFromPage(page, address);

    await page.goto(`${URL_VENDOR}/shop`);
    await page.waitForURL(`${URL_STOREFRONT}/**become-a-vendor`);
});

test("un visiteur sans session est renvoyé vers la connexion", async ({ page }) => {
    await page.goto(`${URL_VENDOR}/shop`);
    await page.waitForURL(`${URL_STOREFRONT}/**sign-in`);
});
