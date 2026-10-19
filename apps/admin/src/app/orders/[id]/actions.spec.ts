import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@clemperl/i18n/messages/admin/fr.json";

const requireAdministrator = vi.fn();
const readOrderForAdministration = vi.fn();
const setOrderStatusAsAdministrator = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../lib/session", () => ({
    requireAdministrator: (...args: unknown[]) => requireAdministrator(...args),
}));
vi.mock("@clemperl/db", () => ({
    prisma: {},
    ERROR_ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
    ERROR_ORDER_STATUS_STALE: "ORDER_STATUS_STALE",
    readOrderForAdministration: (...args: unknown[]) => readOrderForAdministration(...args),
    setOrderStatusAsAdministrator: (...args: unknown[]) =>
        setOrderStatusAsAdministrator(...args),
}));

const { advance } = await import("./actions");
const { INITIAL_STATE } = await import("./types/order-action-state.interface");
const { ERROR_ORDER_NOT_FOUND, ERROR_ORDER_STATUS_STALE } = await import("@clemperl/db");

function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

beforeEach(() => {
    vi.resetAllMocks();
    requireAdministrator.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    setOrderStatusAsAdministrator.mockResolvedValue(undefined);
});

describe("advance", () => {
    // `E_ORDER_ACTION` est un objet littéral : `constructor` y rend une fonction et non
    // `undefined`, que le domaine prendrait pour une action valide.
    it("refuse une action inventée, y compris `constructor`", async () => {
        // Une vraie commande est rendue : sans la garde, l'action irait jusqu'à la lire, et
        // c'est ce que la dernière assertion attrape.
        readOrderForAdministration.mockResolvedValue({ id: "o1", status: "PLACED" });
        for (const invente of ["", "BANANA", "constructor", "toString"]) {
            const state = await advance(INITIAL_STATE, form({ orderId: "o1", action: invente }));
            expect(state.error).toBe(messages.errors.order.failed);
        }
        expect(setOrderStatusAsAdministrator).not.toHaveBeenCalled();
        expect(readOrderForAdministration).not.toHaveBeenCalled();
    });

    // La garde est rappelée dans l'action : un refus de la session arrête tout avant la
    // moindre lecture.
    it("s'arrête quand la session refuse l'accès", async () => {
        requireAdministrator.mockRejectedValue(new Error("FORBIDDEN"));

        await expect(
            advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" })),
        ).rejects.toThrow("FORBIDDEN");

        expect(requireAdministrator).toHaveBeenCalled();
        expect(readOrderForAdministration).not.toHaveBeenCalled();
        expect(setOrderStatusAsAdministrator).not.toHaveBeenCalled();
    });

    // Un identifiant inventé ne doit pas rendre un succès silencieux.
    it("refuse une commande qui n'existe pas", async () => {
        readOrderForAdministration.mockResolvedValue(null);

        const state = await advance(
            INITIAL_STATE,
            form({ orderId: "inventé", action: "ACCEPT" }),
        );

        expect(state.error).toBe(messages.errors.order.not_found);
        expect(setOrderStatusAsAdministrator).not.toHaveBeenCalled();
    });

    it("refuse une transition que l'état courant n'autorise pas", async () => {
        readOrderForAdministration.mockResolvedValue({ id: "o1", status: "SHIPPED" });

        const state = await advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" }));

        expect(state.error).toBe(messages.errors.order.moved);
        expect(setOrderStatusAsAdministrator).not.toHaveBeenCalled();
    });

    it("passe l'état LU comme `from`, et non celui qu'on vise", async () => {
        readOrderForAdministration.mockResolvedValue({ id: "o1", status: "PLACED" });

        await advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" }));

        expect(setOrderStatusAsAdministrator).toHaveBeenCalledWith(expect.anything(), {
            orderId: "o1",
            from: "PLACED",
            status: "ACCEPTED",
        });
    });

    // La matrice de T6b ne distingue pas les commandes : les deux niveaux d'administration
    // passent la même garde, et rien ici ne justifie de l'étendre.
    it("laisse passer les deux niveaux d'administration", async () => {
        readOrderForAdministration.mockResolvedValue({ id: "o1", status: "PLACED" });

        for (const role of ["ADMIN", "SUPER_ADMIN"]) {
            requireAdministrator.mockResolvedValue({ user: { id: "u1", role } });
            const state = await advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" }));
            expect(state.error).toBe("");
        }
    });

    // Une commande supprimée entre la lecture et l'écriture : le dépôt refuse avec l'erreur
    // « introuvable », que l'action traduit comme une commande qui n'existe pas.
    it("traduit le refus du dépôt quand la commande a disparu entre la lecture et l'écriture", async () => {
        readOrderForAdministration.mockResolvedValue({ id: "o1", status: "PLACED" });
        setOrderStatusAsAdministrator.mockRejectedValue(new Error(ERROR_ORDER_NOT_FOUND));

        const state = await advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" }));

        expect(state.error).toBe(messages.errors.order.not_found);
    });

    // Un paiement peut être reçu entre l'affichage et le clic, par le fournisseur ou par un
    // pointage du vendeur, sans que l'état de la commande bouge : la comparaison sur l'état
    // ne voit rien. L'écran promet de prévenir AVANT d'annuler une commande payée.
    it("refuse une annulation quand le paiement a été reçu depuis l'affichage", async () => {
        readOrderForAdministration.mockResolvedValue({
            id: "o1",
            status: "PLACED",
            paymentStatus: "SETTLED",
        });

        const state = await advance(
            INITIAL_STATE,
            form({ orderId: "o1", action: "CANCEL", paymentStatus: "PENDING" }),
        );

        expect(state.error).toBe(messages.errors.order.settled);
        expect(setOrderStatusAsAdministrator).not.toHaveBeenCalled();
    });

    // La garde ne vise que le paiement REÇU : une commande impayée s'annule comme avant.
    it("laisse annuler une commande impayée", async () => {
        readOrderForAdministration.mockResolvedValue({
            id: "o1",
            status: "PLACED",
            paymentStatus: "PENDING",
        });

        const state = await advance(
            INITIAL_STATE,
            form({ orderId: "o1", action: "CANCEL", paymentStatus: "PENDING" }),
        );

        expect(state.error).toBe("");
        expect(setOrderStatusAsAdministrator).toHaveBeenCalledWith(expect.anything(), {
            orderId: "o1",
            from: "PLACED",
            status: "CANCELLED",
        });
    });

    // Annuler une commande payée reste PERMIS : il suffit que l'écran l'ait dit.
    it("laisse annuler une commande payée quand l'écran l'affichait déjà payée", async () => {
        readOrderForAdministration.mockResolvedValue({
            id: "o1",
            status: "PLACED",
            paymentStatus: "SETTLED",
        });

        const state = await advance(
            INITIAL_STATE,
            form({ orderId: "o1", action: "CANCEL", paymentStatus: "SETTLED" }),
        );

        expect(state.error).toBe("");
        expect(setOrderStatusAsAdministrator).toHaveBeenCalledWith(expect.anything(), {
            orderId: "o1",
            from: "PLACED",
            status: "CANCELLED",
        });
    });

    it("traduit le refus du dépôt quand la commande a bougé", async () => {
        readOrderForAdministration.mockResolvedValue({ id: "o1", status: "PLACED" });
        setOrderStatusAsAdministrator.mockRejectedValue(new Error(ERROR_ORDER_STATUS_STALE));

        const state = await advance(INITIAL_STATE, form({ orderId: "o1", action: "ACCEPT" }));

        expect(state.error).toBe(messages.errors.order.moved);
    });
});
