import { describe, expect, it } from "vitest";
import { administratorInvitationSchema } from "./administrator-invitation.schema.js";

describe("l'invitation d'un administrateur", () => {
    it("accepte un nom et une adresse", () => {
        const parsed = administratorInvitationSchema.parse({
            name: "  Awa Traoré  ",
            email: "awa@clemperl.test",
            role: "ADMIN",
        });
        // Le nom est RABOTÉ : il s'affiche dans la liste, et « Awa » précédé de deux
        // espaces y creuserait un trou qu'aucun écran ne rattrape.
        expect(parsed.name).toBe("Awa Traoré");
    });

    // Le chemin d'invitation n'appelle pas `signUpEmail`, donc rien d'autre ne valide
    // l'adresse : sans ce schéma, une chaîne vide entrerait en base et le compte serait
    // injoignable pour toujours.
    it("refuse une adresse qui n'en est pas une", () => {
        expect(administratorInvitationSchema.safeParse({
            name: "Awa", email: "awa", role: "ADMIN",
        }).success).toBe(false);
        expect(administratorInvitationSchema.safeParse({
            name: "Awa", email: "", role: "ADMIN",
        }).success).toBe(false);
    });

    it("refuse un nom vide ou réduit à des espaces", () => {
        expect(administratorInvitationSchema.safeParse({
            name: "   ", email: "awa@clemperl.test", role: "ADMIN",
        }).success).toBe(false);
    });

    // `CUSTOMER` n'est pas un niveau qu'on accorde : le refuser ICI évite que le
    // formulaire serve à créer des clients.
    it("n'accepte que les deux niveaux d'administration", () => {
        expect(administratorInvitationSchema.safeParse({
            name: "Awa", email: "awa@clemperl.test", role: "CUSTOMER",
        }).success).toBe(false);
    });
});
