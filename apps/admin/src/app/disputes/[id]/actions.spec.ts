import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@clemperl/i18n/messages/admin/fr.json";

const requireAdministrator = vi.fn();
const readDisputeForAdministration = vi.fn();
const decideDispute = vi.fn();
const send = vi.fn();
const createSmtpSender = vi.fn();

const redirect = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
    redirect: (...args: unknown[]) => {
        redirect(...args);
        throw new Error("NEXT_REDIRECT");
    },
}));
vi.mock("../../../lib/session", () => ({
    requireAdministrator: (...args: unknown[]) => requireAdministrator(...args),
}));
vi.mock("@clemperl/core", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@clemperl/core")>()),
    createSmtpSender: (...args: unknown[]) => createSmtpSender(...args),
}));
vi.mock("@clemperl/db", () => ({
    prisma: {},
    ERROR_DISPUTE_NOT_FOUND: "DISPUTE_NOT_FOUND",
    ERROR_DISPUTE_STALE: "DISPUTE_STALE",
    readDisputeForAdministration: (...args: unknown[]) => readDisputeForAdministration(...args),
    decideDispute: (...args: unknown[]) => decideDispute(...args),
}));

const { decide } = await import("./actions");
const { INITIAL_DECISION_STATE } = await import("./types/decision-state.interface");

const ERRORS = messages.errors.dispute;

function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

const VALID = { disputeId: "d1", outcome: "DECIDE_FOR_BUYER", comment: "La photo montre un fermoir cassé." };

beforeEach(() => {
    vi.resetAllMocks();
    requireAdministrator.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    readDisputeForAdministration.mockResolvedValue({ id: "d1", status: "OPEN" });
    send.mockResolvedValue(undefined);
    createSmtpSender.mockImplementation(() => ({ send: (...args: unknown[]) => send(...args) }));
    decideDispute.mockResolvedValue({
        orderId: "o1",
        reference: "CMD-2026-ABC123",
        buyerEmail: "acheteuse@exemple.test",
        buyerLocale: "en",
        vendorContactEmail: "contact@atelier.test",
        vendorLocale: "fr",
    });
});

describe("trancher un litige", () => {
    it("s'arrête quand la session refuse", async () => {
        requireAdministrator.mockRejectedValue(new Error("FORBIDDEN"));

        await expect(decide(INITIAL_DECISION_STATE, form(VALID))).rejects.toThrow("FORBIDDEN");
        expect(readDisputeForAdministration).not.toHaveBeenCalled();
    });

    // Une issue est validée contre les DEUX décisions seules : `SERVE` est une transition
    // réelle du domaine, mais elle appartient à l'acheteur.
    it("refuse une issue vide ou inventée, `constructor` et `SERVE` compris", async () => {
        for (const outcome of ["", "BANANA", "constructor", "SERVE"]) {
            const state = await decide(INITIAL_DECISION_STATE, form({ ...VALID, outcome }));
            expect(state.message).toEqual([ERRORS.outcome_required]);
        }
        expect(decideDispute).not.toHaveBeenCalled();
    });

    it("refuse un commentaire fait d'espaces", async () => {
        const state = await decide(INITIAL_DECISION_STATE, form({ ...VALID, comment: "   " }));

        expect(state.message).toEqual([ERRORS.comment_required]);
        expect(decideDispute).not.toHaveBeenCalled();
    });

    it("passe l'état LU, l'état calculé par le domaine et l'administrateur de la session", async () => {
        await expect(decide(INITIAL_DECISION_STATE, form(VALID))).rejects.toThrow("NEXT_REDIRECT");

        expect(decideDispute).toHaveBeenCalledWith(expect.anything(), {
            disputeId: "d1",
            decidedById: "admin-1",
            from: "OPEN",
            status: "DECIDED_FOR_BUYER",
            comment: "La photo montre un fermoir cassé.",
        });
    });

    it("dit que le litige a changé, qu'il soit déjà tranché ou que l'écriture le refuse", async () => {
        readDisputeForAdministration.mockResolvedValueOnce({ id: "d1", status: "DECIDED_FOR_VENDOR" });
        expect((await decide(INITIAL_DECISION_STATE, form(VALID))).message).toEqual([ERRORS.moved]);

        decideDispute.mockRejectedValueOnce(new Error("DISPUTE_STALE"));
        expect((await decide(INITIAL_DECISION_STATE, form(VALID))).message).toEqual([ERRORS.moved]);
    });

    it("refuse un litige qui n'existe pas", async () => {
        readDisputeForAdministration.mockResolvedValue(null);

        expect((await decide(INITIAL_DECISION_STATE, form(VALID))).message).toEqual([ERRORS.not_found]);
    });

    // Chacun lit la décision dans SA langue : l'acheteur dans celle du litige, la boutique
    // dans celle de sa candidature.
    it("écrit à l'acheteur et à la boutique, chacun dans sa langue, puis mène au litige", async () => {
        await expect(decide(INITIAL_DECISION_STATE, form(VALID))).rejects.toThrow("NEXT_REDIRECT");

        expect(redirect).toHaveBeenCalledWith("/disputes/d1?notice=decided");
        expect(send).toHaveBeenCalledTimes(2);
        const recipients = send.mock.calls.map(([message]) => (message as { recipient: string }).recipient);
        expect(recipients.sort()).toEqual(["acheteuse@exemple.test", "contact@atelier.test"]);
        const buyerMail = send.mock.calls.find(
            ([message]) => (message as { recipient: string }).recipient === "acheteuse@exemple.test",
        )?.[0] as { subject: string; text: string };
        expect(buyerMail.subject).toContain("Your dispute");
        expect(buyerMail.text).toContain("/en/orders/CMD-2026-ABC123/dispute");
    });

    // Tranché, le litige n'offre plus de formulaire : un message porté par son état
    // disparaîtrait avec lui. L'avis voyage donc dans l'URL, et la page le montre.
    // Sans adresse de relais, la création de l'expéditeur lève elle-même. La décision est
    // déjà écrite : l'administrateur doit lire l'avis d'échec, pas une page d'erreur.
    it("dit l'échec quand le relais n'est pas configuré, sans lever", async () => {
        createSmtpSender.mockImplementation(() => {
            throw new Error("URL SMTP absente : aucun courriel ne pourrait partir.");
        });

        await expect(decide(INITIAL_DECISION_STATE, form(VALID))).rejects.toThrow("NEXT_REDIRECT");

        expect(decideDispute).toHaveBeenCalled();
        expect(redirect).toHaveBeenCalledWith("/disputes/d1?notice=mail_failed");
    });

    it("tente le second courriel quand le premier échoue, et le dit par la page", async () => {
        send.mockRejectedValueOnce(new Error("relais en panne"));

        await expect(decide(INITIAL_DECISION_STATE, form(VALID))).rejects.toThrow("NEXT_REDIRECT");

        expect(send).toHaveBeenCalledTimes(2);
        expect(redirect).toHaveBeenCalledWith("/disputes/d1?notice=mail_failed");
    });
});
