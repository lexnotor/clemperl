import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileField } from "./file-field";

function renderField(onChange?: (event: unknown) => void) {
    return render(
        <FileField
            label="Registre de commerce"
            chooseLabel="Choisir un fichier"
            emptyLabel="Aucun fichier choisi"
            name="REGISTRY"
            onChange={onChange as never}
        />,
    );
}

describe("FileField", () => {
    it("reste un vrai champ de fichier, atteignable par son libellé", () => {
        renderField();
        const control = screen.getByLabelText("Registre de commerce");
        expect(control).toHaveAttribute("type", "file");
        expect(control).toHaveAttribute("name", "REGISTRY");
    });

    // Le contrôle natif affiche « Choose File » dans la langue du navigateur : c'est
    // pour cela qu'il est masqué au profit d'un déclencheur que nous libellons.
    it("annonce l'absence de fichier dans la langue de la page", () => {
        renderField();
        expect(screen.getByText("Choisir un fichier")).toBeVisible();
        expect(screen.getByText("Aucun fichier choisi")).toBeVisible();
    });

    // Le champ doit fonctionner sans que l'appelant écoute le changement : le formulaire
    // lit le fichier dans le `FormData`, pas dans un état React.
    it("revient à l'état vide quand la sélection est annulée, sans écouteur", async () => {
        renderField();
        const control = screen.getByLabelText("Registre de commerce");

        await userEvent.upload(control, new File(["x"], "rccm.pdf", { type: "application/pdf" }));
        expect(screen.getByText("rccm.pdf")).toBeVisible();

        await userEvent.upload(control, []);
        expect(screen.getByText("Aucun fichier choisi")).toBeVisible();
    });

    it("affiche le nom du fichier choisi et prévient l'appelant", async () => {
        const onChange = vi.fn();
        renderField(onChange);

        await userEvent.upload(
            screen.getByLabelText("Registre de commerce"),
            new File(["x"], "rccm.pdf", { type: "application/pdf" }),
        );

        expect(screen.getByText("rccm.pdf")).toBeVisible();
        expect(screen.queryByText("Aucun fichier choisi")).toBeNull();
        expect(onChange).toHaveBeenCalledOnce();
    });
});
