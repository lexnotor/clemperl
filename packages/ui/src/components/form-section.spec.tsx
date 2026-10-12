import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormSection } from "./form-section";

describe("FormSection", () => {
    it("annonce son titre et rend son contenu", () => {
        render(
            <FormSection title="Identité légale">
                <input aria-label="Raison sociale" />
            </FormSection>,
        );

        expect(screen.getByRole("heading", { name: "Identité légale" })).toBeVisible();
        expect(screen.getByLabelText("Raison sociale")).toBeVisible();
    });

    // Le `fieldset` groupe les champs pour les technologies d'assistance ; sa `legend`
    // reste hors écran parce que le titre visible dit déjà la même chose, et l'entendre
    // deux fois n'aide personne.
    it("groupe ses champs dans un fieldset nommé", () => {
        render(
            <FormSection title="Pièces justificatives">
                <input aria-label="Registre" />
            </FormSection>,
        );
        expect(screen.getByRole("group", { name: "Pièces justificatives" })).toBeInTheDocument();
    });

    // Le titre NOMME le groupe, la règle le DÉCRIT. Ce que ce test prouve est le lien,
    // pas sa restitution : jsdom ne fait parler aucun lecteur d'écran, et aucun navigateur
    // n'est en jeu ici.
    it("relie le groupe à la phrase qui en dit la règle", () => {
        render(
            <FormSection title="Paiements" describedBy="rule">
                <p id="rule">Au moins un paiement.</p>
            </FormSection>,
        );
        const group = screen.getByRole("group", { name: "Paiements" });
        expect(group).toHaveAccessibleDescription("Au moins un paiement.");
    });
});
