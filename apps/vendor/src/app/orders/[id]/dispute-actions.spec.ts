import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@clemperl/i18n/messages/vendor/fr.json";

const requireVendorMembership = vi.fn();
const postDisputeMessageAsVendor = vi.fn();
const uploadDocumentBatch = vi.fn();
const deleteDocuments = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../lib/session", () => ({
    requireVendorMembership: (...args: unknown[]) => requireVendorMembership(...args),
}));
vi.mock("@clemperl/core", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@clemperl/core")>()),
    uploadDocumentBatch: (...args: unknown[]) => uploadDocumentBatch(...args),
    deleteDocuments: (...args: unknown[]) => deleteDocuments(...args),
}));
vi.mock("@clemperl/db", () => ({
    prisma: {},
    ERROR_DISPUTE_STALE: "DISPUTE_STALE",
    postDisputeMessageAsVendor: (...args: unknown[]) => postDisputeMessageAsVendor(...args),
}));

const { replyToDisputeAsVendorAction } = await import("./dispute-actions");
const { INITIAL_DISPUTE_FORM_STATE } = await import("../types/dispute-form-state.interface");

const T = messages.disputes;
const STORED = { objectPath: "disputes/x/evidence-1.pdf", mimeType: "application/pdf", sizeBytes: 3, originalName: "bon.pdf" };

function form(fields: Record<string, string>, files: File[] = []): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    for (const file of files) data.append("attachments", file);
    return data;
}
const pdf = () => new File(["pdf"], "bon.pdf", { type: "application/pdf" });

beforeEach(() => {
    vi.resetAllMocks();
    requireVendorMembership.mockResolvedValue({
        session: { user: { id: "membre-1" } },
        vendor: { id: "boutique-1" },
    });
    uploadDocumentBatch.mockResolvedValue([STORED]);
    deleteDocuments.mockResolvedValue(undefined);
    postDisputeMessageAsVendor.mockResolvedValue(undefined);
});

describe("répondre à un litige, côté boutique", () => {
    it("s'arrête quand la garde refuse", async () => {
        requireVendorMembership.mockRejectedValue(new Error("NEXT_REDIRECT"));

        await expect(
            replyToDisputeAsVendorAction(INITIAL_DISPUTE_FORM_STATE, form({ disputeId: "d1", body: "Bonjour." })),
        ).rejects.toThrow();
        expect(postDisputeMessageAsVendor).not.toHaveBeenCalled();
    });

    // La boutique vient de la session, jamais d'un champ posté : sans quoi un membre
    // écrirait au nom d'une autre boutique.
    it("passe la boutique du membre au dépôt, jamais un champ posté", async () => {
        const state = await replyToDisputeAsVendorAction(
            INITIAL_DISPUTE_FORM_STATE,
            form({ disputeId: "d1", body: "Voici le bon signé.", vendorId: "autre-boutique" }, [pdf()]),
        );

        expect(state.message).toEqual([]);
        expect(postDisputeMessageAsVendor).toHaveBeenCalledWith(expect.anything(), {
            vendorId: "boutique-1",
            authorId: "membre-1",
            disputeId: "d1",
            body: "Voici le bon signé.",
            attachments: [STORED],
        });
    });

    it("refuse un message vide sans rien téléverser", async () => {
        const state = await replyToDisputeAsVendorAction(
            INITIAL_DISPUTE_FORM_STATE,
            form({ disputeId: "d1", body: " " }, [pdf()]),
        );

        expect(state.message).toEqual([T.violations.body_required]);
        expect(uploadDocumentBatch).not.toHaveBeenCalled();
        expect(postDisputeMessageAsVendor).not.toHaveBeenCalled();
    });

    it("dit le plafond de pièces, valeur comprise", async () => {
        const state = await replyToDisputeAsVendorAction(
            INITIAL_DISPUTE_FORM_STATE,
            form({ disputeId: "d1", body: "Pièces." }, [pdf(), pdf(), pdf(), pdf()]),
        );

        expect(state.message).toEqual(["Joignez 3 pièces au plus."]);
    });

    it("défait les téléversements quand le litige a changé", async () => {
        postDisputeMessageAsVendor.mockRejectedValue(new Error("DISPUTE_STALE"));

        const state = await replyToDisputeAsVendorAction(
            INITIAL_DISPUTE_FORM_STATE,
            form({ disputeId: "d1", body: "Trop tard ?" }, [pdf()]),
        );

        expect(state.message).toEqual([T.moved]);
        expect(deleteDocuments).toHaveBeenCalledWith([STORED.objectPath]);
        // React vide le formulaire même sur un refus : la réponse revient pour être réaffichée.
        expect(state.values).toEqual({ body: "Trop tard ?" });
    });
});
