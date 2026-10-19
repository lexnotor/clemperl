import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadDocument = vi.fn();
const deleteDocuments = vi.fn();
vi.mock("./document-storage.utils.js", () => ({
    uploadDocument: (...args: unknown[]) => uploadDocument(...args),
    deleteDocuments: (...args: unknown[]) => deleteDocuments(...args),
}));

const { submittedFiles, uploadDocumentBatch } = await import("./document-batch.utils.js");

function file(name: string, content: string, type = "image/jpeg"): File {
    return new File([content], name, { type });
}

beforeEach(() => {
    vi.resetAllMocks();
    uploadDocument.mockResolvedValue(undefined);
    deleteDocuments.mockResolvedValue(undefined);
});

describe("lire les fichiers d'un formulaire", () => {
    // Un champ de fichier laissé vide poste un fichier de taille nulle et de nom vide. Le
    // garder le stockerait comme une preuve, et le compterait dans la limite de trois.
    it("écarte le fichier vide d'un champ laissé vide, et garde les vrais", () => {
        const form = new FormData();
        form.append("attachments", new File([], "", { type: "application/octet-stream" }));
        form.append("attachments", file("colis.jpg", "abc"));
        form.append("attachments", "pas un fichier");

        const files = submittedFiles(form, "attachments");

        expect(files.map((f) => f.name)).toEqual(["colis.jpg"]);
    });

    // La forme RÉELLE dans une action serveur Next : son décodeur multipart perd le nom
    // vide, et `FormData` donne alors au fichier son nom par défaut, `blob`. Reproduit en
    // décodant avec le `busboy` que Next embarque.
    it("écarte aussi le champ vide tel que Next le décode, nommé `blob`", () => {
        const form = new FormData();
        form.append("attachments", new Blob([], { type: "application/octet-stream" }));
        form.append("attachments", file("bon.pdf", "pdf", "application/pdf"));

        expect(submittedFiles(form, "attachments").map((f) => f.name)).toEqual(["bon.pdf"]);
    });

    it("rend une liste vide pour un champ absent", () => {
        expect(submittedFiles(new FormData(), "attachments")).toEqual([]);
    });
});

describe("téléverser un lot de pièces", () => {
    it("rend une pièce stockée par fichier, rangée sous le préfixe", async () => {
        const stored = await uploadDocumentBatch("disputes/abc", "evidence", [
            file("Colis Abîmé.JPG", "abcd"),
            file("bon.pdf", "pdf", "application/pdf"),
        ]);

        expect(stored).toHaveLength(2);
        expect(stored[0]).toMatchObject({
            mimeType: "image/jpeg",
            sizeBytes: 4,
            originalName: "Colis Abîmé.JPG",
        });
        expect(stored[0]?.objectPath).toMatch(/^disputes\/abc\/evidence-[0-9a-f-]+\.jpg$/);
        expect(stored[1]?.objectPath).toMatch(/\.pdf$/);
        expect(uploadDocument).toHaveBeenCalledTimes(2);
    });

    // Il n'existe pas de transaction commune au stockage et à la base : une pièce déjà
    // déposée quand la suivante échoue resterait orpheline.
    it("défait les pièces déjà déposées quand un dépôt échoue, puis relève l'erreur", async () => {
        uploadDocument.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("panne"));

        await expect(
            uploadDocumentBatch("disputes/abc", "evidence", [file("a.jpg", "a"), file("b.jpg", "b")]),
        ).rejects.toThrow("panne");

        const premier = uploadDocument.mock.calls[0]?.[0] as string;
        expect(deleteDocuments).toHaveBeenCalledWith([premier]);
    });

    it("ne téléverse rien pour un lot vide", async () => {
        expect(await uploadDocumentBatch("disputes/abc", "evidence", [])).toEqual([]);
        expect(uploadDocument).not.toHaveBeenCalled();
    });
});
