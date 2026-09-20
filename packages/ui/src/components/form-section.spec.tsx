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
});
