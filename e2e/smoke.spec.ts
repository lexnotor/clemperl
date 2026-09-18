import { expect, test } from "@playwright/test";

const devHost = process.env["DEV_HOST"] ?? "127-0-0-1.sslip.io";

test("la boutique affiche son accueil en français", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ClemPerl");
    await expect(page.getByText("vendeurs indépendants")).toBeVisible();
});

test("la boutique bascule en anglais sous /en", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByText("independent sellers")).toBeVisible();
});

test("l'espace vendeur répond sur son sous-domaine", async ({ page }) => {
    await page.goto(`https://vendeur.${devHost}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Espace vendeur");
});

test("l'administration répond sur son sous-domaine", async ({ page }) => {
    await page.goto(`https://admin.${devHost}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Administration ClemPerl",
    );
});

test("le bouton partagé de @clemperl/ui est rendu par la boutique", async ({ page }) => {
    await page.goto("/");
    // Le composant vient du design system partagé : s'il ne se rend pas, c'est la
    // chaîne de transpilation des packages internes qui est cassée, pas la page.
    await expect(page.getByRole("button", { name: "ClemPerl" })).toBeVisible();
});

test("la racine négocie la langue d'après l'en-tête du navigateur", async ({ browser }) => {
    // Comportement voulu de `localePrefix: "as-needed"` : la racine sert la langue
    // demandée par le navigateur, sans préfixe. Un visiteur anglophone y reçoit
    // l'anglais, un francophone le français, sur la même URL.
    const contexteAnglais = await browser.newContext({ locale: "en-US" });
    const pageAnglaise = await contexteAnglais.newPage();
    await pageAnglaise.goto(`https://${devHost}/`);
    await expect(pageAnglaise.getByText("independent sellers")).toBeVisible();
    await contexteAnglais.close();
});
