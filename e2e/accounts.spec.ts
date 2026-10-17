import { expect, test } from "@playwright/test";
import { URL_ADMIN, URL_MAILPIT } from "../playwright.config";
import {
    PASSWORD,
    linkFor,
    messageCountFor,
    signInAsAdministrator,
    signInFromPage,
} from "./helpers/accounts";

test("un super_admin invite un administrateur, qui choisit son mot de passe et entre", async ({
    page,
    request,
    browser,
}) => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const address = `collegue-${suffix}@clemperl.test`;

    await signInAsAdministrator(page);
    await page.goto(`${URL_ADMIN}/accounts`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Nom").fill(`Collègue ${suffix}`);
    await page.getByLabel("Adresse e-mail").fill(address);
    await page.getByRole("combobox", { name: "Niveau" }).selectOption("ADMIN");
    await page.getByRole("button", { name: "Envoyer l'invitation" }).click();

    // La ligne APPARAÎT, marquée en attente : on attend ce que l'action a produit, pas un
    // libellé que l'écran portait déjà.
    const row = page.locator("li").filter({ hasText: address });
    await expect(row.getByText("Invitation en attente")).toBeVisible({ timeout: 30_000 });

    // Le lien, pris dans le courriel. `linkFor` attend celui qui porte le fragment
    // attendu : un compte peut recevoir plusieurs messages.
    const link = await linkFor(request, address, "reset-password");

    // Le message est celui de BIENVENUE, pas la réinitialisation ordinaire : le choix se
    // fait sur l'identifiant de l'utilisateur, que ce parcours est seul à établir.
    const search = await request.get(
        `${URL_MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
    );
    const subjects = ((await search.json()).messages as { Subject: string }[]).map(
        (message) => message.Subject,
    );
    expect(subjects).toEqual(["Votre compte d'administration ClemPerl est prêt"]);

    const invited = await browser.newContext();
    const own = await invited.newPage();
    await own.goto(link);
    await own.waitForLoadState("networkidle");
    await own.getByLabel("Nouveau mot de passe").fill(PASSWORD);
    await own.getByRole("button", { name: "Enregistrer" }).click();
    await own.waitForURL(/\/sign-in/, { timeout: 30_000 });

    await signInFromPage(own, address);
    await own.goto(`${URL_ADMIN}/accounts`);

    // Il est DANS l'administration, et son niveau ne lui laisse pas nommer de
    // super_admin : l'option est absente du DOM, pas seulement masquée.
    await expect(own.getByRole("heading", { level: 1 })).toHaveText("Les administrateurs");
    const level = own.getByRole("combobox", { name: "Niveau" });
    await expect(level.getByRole("option", { name: "Administrateur", exact: true })).toHaveCount(1);
    await expect(level.getByRole("option", { name: "Super-administrateur" })).toHaveCount(0);
    await expect(own.getByRole("button", { name: "Élever en super-administrateur" })).toHaveCount(
        0,
    );

    // Et il n'est PLUS en attente, vu du bureau qui l'a invité.
    await page.reload();
    await expect(row.getByText(address)).toBeVisible();
    await expect(row.getByText("Invitation en attente")).toHaveCount(0);

    // UN seul courriel, compté à la FIN : un courriel de vérification parti avec
    // l'invitation aurait eu tout le parcours pour arriver.
    expect(await messageCountFor(request, address)).toBe(1);

    await invited.close();
});
