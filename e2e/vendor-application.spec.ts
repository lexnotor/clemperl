import { expect, test } from "@playwright/test";
import { URL_ADMIN, URL_STOREFRONT } from "../playwright.config";
import {
    createVerifiedAccount,
    expectSubjectFor,
    PASSWORD,
    signInFromPage,
} from "./helpers/accounts";

const ADMIN_EMAIL = "administration@clemperl.test";

// Les deux tests partagent un état global — l'existence d'un administrateur, que le
// premier crée par la page d'amorçage. En parallèle, le second tomberait tantôt sur un
// 404, tantôt sur une redirection vers `/setup`.
test.describe.configure({ mode: "serial" });

// Le délai par défaut de 30 s ne suffit pas : ce parcours traverse deux applications et
// une dizaine d'écrans, dont plusieurs sont compilés à la demande au premier passage.
test.setTimeout(180_000);

// Le premier prouve la tranche telle qu'on la vit : il traverse deux applications,
// un refus, une correction et une acceptation. Aucune assertion sur un en-tête ne
// remplacerait ce parcours.
test("un candidat dépose, est refusé, corrige, et devient vendeur", async ({
    page,
    browser,
    request,
}) => {
    const suffix = Date.now();
    const address = `candidat-${suffix}@exemple.test`;
    const shopName = `Atelier ${suffix}`;

    await createVerifiedAccount(request, address);
    await signInFromPage(page, address);

    await page.goto(`${URL_STOREFRONT}/become-a-vendor`);
    await page.getByLabel("Nom de la boutique").fill(shopName);
    await page
        .getByLabel("Description")
        .fill("Maroquinerie artisanale, pièces uniques cousues main à Bruxelles.");
    await page.getByLabel("Adresse e-mail de contact").fill(address);
    await page.getByLabel("Téléphone de contact").fill("+32470000000");
    await page.getByLabel("Maroquinerie").check();
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
    await expectSubjectFor(request, address, shopName);

    // L'administrateur travaille dans un contexte SÉPARÉ : deux sessions dans le même
    // contexte partageraient le cookie et s'écraseraient.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    // Aucun administrateur n'est semé : sur une base neuve, l'instance s'amorce ici. Une
    // fois faite, la page disparaît — d'où la branche qui se connecte simplement.
    await adminPage.goto(`${URL_ADMIN}/setup`);
    if (await adminPage.getByRole("button", { name: "Créer l'administrateur" }).isVisible()) {
        await adminPage.getByLabel("Nom").fill("Administration");
        await adminPage.getByLabel("Adresse e-mail").fill(ADMIN_EMAIL);
        await adminPage.getByLabel("Mot de passe").fill(PASSWORD);
        await adminPage.getByRole("button", { name: "Créer l'administrateur" }).click();
    } else {
        await signInFromPage(adminPage, ADMIN_EMAIL);
    }

    await adminPage.goto(`${URL_ADMIN}/applications`);
    await adminPage.getByRole("link", { name: new RegExp(shopName) }).click();
    // L'administration doit pouvoir OUVRIR la pièce, pas seulement la voir listée : le
    // bucket est privé, et c'est le route handler qui la sert après avoir revérifié le
    // rôle.
    const documentLink = adminPage.getByRole("link", { name: "registry.pdf" });
    const documentUrl = await documentLink.getAttribute("href");
    const document = await adminPage.request.get(`${URL_ADMIN}${documentUrl}`);
    expect(document.status()).toBe(200);
    expect(document.headers()["content-type"]).toBe("application/pdf");

    await adminPage.getByLabel("Motif (obligatoire pour un refus)").selectOption("UNREADABLE_DOCUMENT");
    await adminPage.getByLabel("Commentaire, lu par le candidat").fill("Le registre est illisible.");
    await adminPage.getByRole("button", { name: "Refuser" }).click();
    await expect(adminPage.getByText("Refusé —")).toBeVisible();

    // Le candidat lit le motif, redépose la seule pièce en cause, et renvoie.
    await page.reload();
    await expect(page.getByText("Le registre est illisible.")).toBeVisible();
    await expect(page.getByLabel("Nom de la boutique")).toHaveValue(shopName);
    await page.getByLabel("Registre de commerce").setInputFiles("e2e/fixtures/registry.pdf");
    await page.getByRole("button", { name: "Renvoyer ma demande" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Votre demande est en cours d'examen",
    );

    await adminPage.reload();
    await adminPage.getByRole("button", { name: "Accepter" }).click();

    // Attendre que l'administration CONSTATE la décision avant de recharger côté
    // candidat : un clic ne fait que déclencher la server action, et recharger trop tôt
    // lit un dossier encore en examen.
    await expect(adminPage.getByText("Accepté", { exact: false })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(shopName);
    await expectSubjectFor(request, address, "est validée");

    await adminContext.close();
});

test("un compte sans le rôle d'administrateur n'atteint aucune page du back-office", async ({
    page,
    request,
}) => {
    const address = `intrus-${Date.now()}@exemple.test`;
    await createVerifiedAccount(request, address);
    await signInFromPage(page, address);

    // `notFound()` et non 403 : répondre « interdit » confirmerait que la route existe.
    const response = await page.goto(`${URL_ADMIN}/applications`);
    expect(response?.status()).toBe(404);
});
