import { describe, expect, it } from "vitest";
import { canAppoint, canRemove, isAdministrator } from "./platform-roles.utils.js";

const ROLES = ["CUSTOMER", "ADMIN", "SUPER_ADMIN"] as const;

describe("les rôles de plateforme", () => {
    it("reconnaît les deux niveaux d'administration", () => {
        expect(isAdministrator("ADMIN")).toBe(true);
        expect(isAdministrator("SUPER_ADMIN")).toBe(true);
        expect(isAdministrator("CUSTOMER")).toBe(false);
        expect(isAdministrator("")).toBe(false);
    });

    // Les neuf cases, écrites une par une : une boucle sur un tableau attendu ne dirait
    // pas LAQUELLE a changé le jour où elle rougit.
    it("ne laisse nommer un super_admin qu'à un super_admin", () => {
        expect(canAppoint("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
        expect(canAppoint("SUPER_ADMIN", "ADMIN")).toBe(true);
        expect(canAppoint("ADMIN", "ADMIN")).toBe(true);
        expect(canAppoint("ADMIN", "SUPER_ADMIN")).toBe(false);
        expect(canAppoint("CUSTOMER", "ADMIN")).toBe(false);
        expect(canAppoint("CUSTOMER", "SUPER_ADMIN")).toBe(false);
    });

    // Nommer quelqu'un CLIENT n'est pas nommer : c'est retirer, et cela passe par
    // `canRemove`. Sans ce refus, le formulaire de création servirait à fabriquer des
    // clients depuis l'administration.
    it("ne nomme jamais à `CUSTOMER`", () => {
        for (const actor of ROLES) {
            expect(canAppoint(actor, "CUSTOMER")).toBe(false);
        }
    });

    it("ne laisse retirer un super_admin qu'à un super_admin", () => {
        expect(canRemove("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
        expect(canRemove("SUPER_ADMIN", "ADMIN")).toBe(true);
        expect(canRemove("ADMIN", "ADMIN")).toBe(true);
        expect(canRemove("ADMIN", "SUPER_ADMIN")).toBe(false);
        expect(canRemove("CUSTOMER", "ADMIN")).toBe(false);
        expect(canRemove("CUSTOMER", "SUPER_ADMIN")).toBe(false);
    });

    // Un compte qui ne porte aucun rôle n'a rien à perdre. Le refus ici est ce qui fait
    // dire à l'action « ce compte n'est pas un compte d'administration » plutôt que
    // d'annoncer un retrait qui n'a pas eu lieu.
    it("n'a rien à retirer à un client", () => {
        for (const actor of ROLES) {
            expect(canRemove(actor, "CUSTOMER")).toBe(false);
        }
    });

    // La garde du dernier super_admin ne vit PAS ici : elle dépend du nombre de lignes en
    // base, que cette fonction ne connaît pas. Elle vit dans l'écriture, guardée côté base.
    it("laisse un super_admin se retirer lui-même, la garde du dernier étant ailleurs", () => {
        expect(canRemove("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
    });
});
