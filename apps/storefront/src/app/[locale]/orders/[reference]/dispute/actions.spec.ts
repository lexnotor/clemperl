import { beforeEach, describe, expect, it, vi } from "vitest";

const requireVerifiedSession = vi.fn();
const openDispute = vi.fn();
const postDisputeMessageAsBuyer = vi.fn();
const readDisputeForBuyer = vi.fn();
const markDisputeServed = vi.fn();
const uploadDocumentBatch = vi.fn();
const deleteDocuments = vi.fn();
const send = vi.fn();
const redirect = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
    redirect: (...args: unknown[]) => {
        redirect(...args);
        throw new Error("NEXT_REDIRECT");
    },
}));
// Une traduction rend sa clé complète : les assertions portent sur QUEL message, pas sur
// sa formulation.
vi.mock("next-intl/server", () => ({
    getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
}));
vi.mock("../../../../../env", () => ({ env: { SMTP_URL: "smtp://mailpit:1025", EMAIL_FROM: "a@b.test" } }));
vi.mock("../../../../../lib/session", () => ({
    requireVerifiedSession: (...args: unknown[]) => requireVerifiedSession(...args),
}));
vi.mock("@clemperl/core", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@clemperl/core")>()),
    uploadDocumentBatch: (...args: unknown[]) => uploadDocumentBatch(...args),
    deleteDocuments: (...args: unknown[]) => deleteDocuments(...args),
    createSmtpSender: () => ({ send: (...args: unknown[]) => send(...args) }),
}));
vi.mock("@clemperl/db", () => ({
    prisma: {},
    ERROR_DISPUTE_EXISTS: "DISPUTE_EXISTS",
    ERROR_DISPUTE_NOT_ELIGIBLE: "DISPUTE_NOT_ELIGIBLE",
    ERROR_DISPUTE_INVALID_LINES: "DISPUTE_INVALID_LINES",
    ERROR_ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
    ERROR_DISPUTE_STALE: "DISPUTE_STALE",
    ERROR_DISPUTE_NOT_FOUND: "DISPUTE_NOT_FOUND",
    openDispute: (...args: unknown[]) => openDispute(...args),
    postDisputeMessageAsBuyer: (...args: unknown[]) => postDisputeMessageAsBuyer(...args),
    readDisputeForBuyer: (...args: unknown[]) => readDisputeForBuyer(...args),
    markDisputeServed: (...args: unknown[]) => markDisputeServed(...args),
}));

const { markServedAction, openDisputeAction, replyToDisputeAction } = await import("./actions");
const { INITIAL_DISPUTE_FORM_STATE } = await import("./types/dispute-form-state.interface");

const STORED = {
    objectPath: "disputes/x/evidence-1.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 3,
    originalName: "colis.jpg",
};

function form(fields: Record<string, string | string[]>, files: File[] = []): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        for (const one of Array.isArray(value) ? value : [value]) data.append(key, one);
    }
    for (const file of files) data.append("attachments", file);
    return data;
}

const VALID = {
    reference: "CMD-2026-ABC123",
    lineIds: ["l1"],
    reason: "DAMAGED",
    body: "Le fermoir est cassé.",
    locale: "fr",
};
const jpeg = (name = "colis.jpg", size = 3) => new File(["x".repeat(size)], name, { type: "image/jpeg" });

beforeEach(() => {
    vi.resetAllMocks();
    requireVerifiedSession.mockResolvedValue({ user: { id: "buyer-1", email: "a@acheteur.test" } });
    uploadDocumentBatch.mockResolvedValue([STORED]);
    deleteDocuments.mockResolvedValue(undefined);
    send.mockResolvedValue(undefined);
    openDispute.mockResolvedValue({
        disputeId: "d1",
        orderId: "o1",
        reference: "CMD-2026-ABC123",
        vendorContactEmail: "contact@atelier.test",
        vendorLocale: "fr",
    });
});

describe("ouvrir un litige", () => {
    it("s'arrête quand la session refuse", async () => {
        requireVerifiedSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

        await expect(openDisputeAction(INITIAL_DISPUTE_FORM_STATE, form(VALID))).rejects.toThrow();
        expect(openDispute).not.toHaveBeenCalled();
    });

    // Rien n'est téléversé tant que l'ouverture n'est pas recevable : chaque formulaire
    // refusé laisserait sinon un orphelin dans le bucket.
    it("refuse des pièces irrecevables sans rien téléverser", async () => {
        const state = await openDisputeAction(
            INITIAL_DISPUTE_FORM_STATE,
            form(VALID, [jpeg("a.jpg"), jpeg("b.jpg"), jpeg("c.jpg"), jpeg("d.jpg")]),
        );

        expect(state.message).toContain("errors.dispute.too_many_attachments");
        expect(uploadDocumentBatch).not.toHaveBeenCalled();
    });

    it("refuse le motif vide", async () => {
        const state = await openDisputeAction(INITIAL_DISPUTE_FORM_STATE, form({ ...VALID, reason: "" }));

        expect(state.message).toEqual(["errors.dispute.reason_unknown"]);
        expect(openDispute).not.toHaveBeenCalled();
    });

    it("défait les téléversements quand l'ouverture échoue", async () => {
        openDispute.mockRejectedValue(new Error("DISPUTE_EXISTS"));

        const state = await openDisputeAction(INITIAL_DISPUTE_FORM_STATE, form(VALID, [jpeg()]));

        expect(deleteDocuments).toHaveBeenCalledWith([STORED.objectPath]);
        expect(state.message).toEqual(["disputes.exists"]);
    });

    it("traduit chaque refus du dépôt par son propre message", async () => {
        for (const [code, key] of [
            ["DISPUTE_NOT_ELIGIBLE", "disputes.notEligible"],
            ["DISPUTE_INVALID_LINES", "disputes.invalidLines"],
            ["ORDER_NOT_FOUND", "disputes.failed"],
            ["une panne", "disputes.failed"],
        ]) {
            openDispute.mockRejectedValueOnce(new Error(code));
            const state = await openDisputeAction(INITIAL_DISPUTE_FORM_STATE, form(VALID));
            expect(state.message).toEqual([key]);
        }
    });

    it("passe au dépôt la coupure du domaine, l'acheteur de la session et les pièces", async () => {
        const avant = Date.now();
        await expect(
            openDisputeAction(INITIAL_DISPUTE_FORM_STATE, form({ ...VALID, buyerId: "intrus" }, [jpeg()])),
        ).rejects.toThrow("NEXT_REDIRECT");

        const input = openDispute.mock.calls[0]?.[1] as {
            buyerId: string;
            shippedAfter: Date;
            attachments: unknown[];
        };
        expect(input.buyerId).toBe("buyer-1");
        expect(input.attachments).toEqual([STORED]);
        const quatorzeJours = 14 * 24 * 60 * 60 * 1000;
        expect(Math.abs(avant - quatorzeJours - input.shippedAfter.getTime())).toBeLessThan(5_000);
    });

    it("prévient la boutique, puis mène au litige", async () => {
        await expect(openDisputeAction(INITIAL_DISPUTE_FORM_STATE, form(VALID))).rejects.toThrow(
            "NEXT_REDIRECT",
        );

        expect(send).toHaveBeenCalledWith(expect.objectContaining({ recipient: "contact@atelier.test" }));
        expect(redirect).toHaveBeenCalledWith("/orders/CMD-2026-ABC123/dispute?notice=opened");
    });

    // L'écriture a eu lieu : un relais en panne ne défait pas le litige, mais l'écran le dit.
    it("ouvre le litige même si le courriel échoue, et le dit", async () => {
        send.mockRejectedValue(new Error("relais en panne"));

        await expect(openDisputeAction(INITIAL_DISPUTE_FORM_STATE, form(VALID))).rejects.toThrow(
            "NEXT_REDIRECT",
        );

        expect(redirect).toHaveBeenCalledWith("/orders/CMD-2026-ABC123/dispute?notice=mail_failed");
    });

    it("garde le préfixe de l'anglais, et retombe sur le français pour une langue inventée", async () => {
        await expect(
            openDisputeAction(INITIAL_DISPUTE_FORM_STATE, form({ ...VALID, locale: "en" })),
        ).rejects.toThrow("NEXT_REDIRECT");
        expect(redirect).toHaveBeenLastCalledWith("/en/orders/CMD-2026-ABC123/dispute?notice=opened");

        await expect(
            openDisputeAction(INITIAL_DISPUTE_FORM_STATE, form({ ...VALID, locale: "klingon" })),
        ).rejects.toThrow("NEXT_REDIRECT");
        expect((openDispute.mock.calls[1]?.[1] as { locale: string }).locale).toBe("fr");
    });
});

describe("répondre dans un litige", () => {
    const REPLY = { reference: "CMD-2026-ABC123", disputeId: "d1", body: "Toujours rien reçu." };

    // La garde est rappelée dans l'action : une action serveur est une route publique.
    it("s'arrête quand la session refuse, sans rien écrire", async () => {
        requireVerifiedSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

        await expect(replyToDisputeAction(INITIAL_DISPUTE_FORM_STATE, form(REPLY))).rejects.toThrow();
        expect(uploadDocumentBatch).not.toHaveBeenCalled();
        expect(postDisputeMessageAsBuyer).not.toHaveBeenCalled();
    });

    it("refuse un message vide sans rien téléverser", async () => {
        const state = await replyToDisputeAction(INITIAL_DISPUTE_FORM_STATE, form({ ...REPLY, body: "  " }, [jpeg()]));

        expect(state.message).toEqual(["errors.dispute.body_required"]);
        expect(uploadDocumentBatch).not.toHaveBeenCalled();
    });

    it("écrit au nom de l'acheteur de la session, avec ses pièces", async () => {
        postDisputeMessageAsBuyer.mockResolvedValue(undefined);

        const state = await replyToDisputeAction(INITIAL_DISPUTE_FORM_STATE, form(REPLY, [jpeg()]));

        expect(state.message).toEqual([]);
        expect(postDisputeMessageAsBuyer).toHaveBeenCalledWith(expect.anything(), {
            buyerId: "buyer-1",
            disputeId: "d1",
            body: "Toujours rien reçu.",
            attachments: [STORED],
        });
    });

    // Un litige tranché pendant que la page était ouverte : le message est refusé par la
    // base, et ses pièces ne doivent pas rester orphelines.
    it("dit que le litige a changé, et défait les téléversements", async () => {
        postDisputeMessageAsBuyer.mockRejectedValue(new Error("DISPUTE_STALE"));

        const state = await replyToDisputeAction(INITIAL_DISPUTE_FORM_STATE, form(REPLY, [jpeg()]));

        expect(state.message).toEqual(["disputes.moved"]);
        expect(deleteDocuments).toHaveBeenCalledWith([STORED.objectPath]);
    });
});

describe("se déclarer servi", () => {
    const SERVE = { reference: "CMD-2026-ABC123", disputeId: "d1" };

    it("s'arrête quand la session refuse, sans rien lire", async () => {
        requireVerifiedSession.mockRejectedValue(new Error("NEXT_REDIRECT"));

        await expect(markServedAction(INITIAL_DISPUTE_FORM_STATE, form(SERVE))).rejects.toThrow();
        expect(readDisputeForBuyer).not.toHaveBeenCalled();
        expect(markDisputeServed).not.toHaveBeenCalled();
    });

    it("passe l'état LU comme `from`", async () => {
        readDisputeForBuyer.mockResolvedValue({ id: "d1", status: "DECIDED_FOR_BUYER" });
        markDisputeServed.mockResolvedValue(undefined);

        const state = await markServedAction(INITIAL_DISPUTE_FORM_STATE, form(SERVE));

        expect(state.message).toEqual([]);
        expect(markDisputeServed).toHaveBeenCalledWith(expect.anything(), {
            buyerId: "buyer-1",
            disputeId: "d1",
            from: "DECIDED_FOR_BUYER",
        });
    });

    // Le domaine n'offre pas `SERVE` sur un litige clos en faveur du vendeur.
    it("refuse de servir un litige tranché pour le vendeur", async () => {
        readDisputeForBuyer.mockResolvedValue({ id: "d1", status: "DECIDED_FOR_VENDOR" });

        const state = await markServedAction(INITIAL_DISPUTE_FORM_STATE, form(SERVE));

        expect(state.message).toEqual(["disputes.moved"]);
        expect(markDisputeServed).not.toHaveBeenCalled();
    });

    it("refuse un litige qui n'est pas celui de la commande lue", async () => {
        readDisputeForBuyer.mockResolvedValue({ id: "autre", status: "OPEN" });

        const state = await markServedAction(INITIAL_DISPUTE_FORM_STATE, form(SERVE));

        expect(state.message).toEqual(["disputes.failed"]);
        expect(markDisputeServed).not.toHaveBeenCalled();
    });

    it("dit que le litige a changé quand l'écriture le refuse", async () => {
        readDisputeForBuyer.mockResolvedValue({ id: "d1", status: "OPEN" });
        markDisputeServed.mockRejectedValue(new Error("DISPUTE_STALE"));

        const state = await markServedAction(INITIAL_DISPUTE_FORM_STATE, form(SERVE));

        expect(state.message).toEqual(["disputes.moved"]);
    });
});
