import en from "@clemperl/i18n/messages/vendor-mobile/en.json";
import fr from "@clemperl/i18n/messages/vendor-mobile/fr.json";

// Les chemins pointés de toutes les phrases d'un catalogue, `signIn.submit` par exemple.
function paths(node: unknown, prefix = ""): string[] {
    if (typeof node === "string") {
        return [prefix];
    }
    return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
        paths(child, prefix === "" ? key : `${prefix}.${key}`),
    );
}

function leaves(node: unknown): string[] {
    if (typeof node === "string") {
        return [node];
    }
    return Object.values(node as Record<string, unknown>).flatMap(leaves);
}

describe("les catalogues de l'application", () => {
    // Une clé absente d'une langue afficherait l'autre langue, sans que rien ne le signale.
    it("les deux catalogues ont exactement les mêmes clés", () => {
        expect(paths(en).sort()).toEqual(paths(fr).sort());
    });

    it("aucune phrase n'est vide", () => {
        expect([...leaves(fr), ...leaves(en)].filter((text) => text.trim() === "")).toEqual([]);
    });
});
