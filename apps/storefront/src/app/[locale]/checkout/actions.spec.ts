import { beforeEach, describe, expect, it, vi } from "vitest";

const requireVerifiedSession = vi.fn();
const readCart = vi.fn();
const placeOrders = vi.fn();
const publishRealtimeEvent = vi.fn();
const redirect = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("next/navigation", () => ({
    redirect: (...args: unknown[]) => {
        redirect(...args);
        throw new Error("NEXT_REDIRECT");
    },
}));
vi.mock("../../../lib/session", () => ({
    requireVerifiedSession: (...args: unknown[]) => requireVerifiedSession(...args),
}));
vi.mock("@clemperl/core", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@clemperl/core")>()),
    publishRealtimeEvent: (...args: unknown[]) => publishRealtimeEvent(...args),
}));
vi.mock("@clemperl/db", () => ({
    prisma: {},
    ERROR_CART_EMPTY: "CART_EMPTY",
    ERROR_ITEM_INELIGIBLE: "ORDER_ITEM_INELIGIBLE",
    ERROR_METHOD_UNAVAILABLE: "ORDER_METHOD_UNAVAILABLE",
    ERROR_TOTAL_CHANGED: "TOTAL_CHANGED",
    readCart: (...args: unknown[]) => readCart(...args),
    placeOrders: (...args: unknown[]) => placeOrders(...args),
}));

const { submitCheckout } = await import("./actions");

const VALID = {
    name: "Awa Diallo",
    phone: "+3221234567",
    line: "12 rue des Lilas",
    city: "Bruxelles",
    country: "BE",
    expectedTotal: "4200",
};

function form(fields: Record<string, string> = VALID): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

beforeEach(() => {
    vi.resetAllMocks();
    requireVerifiedSession.mockResolvedValue({ user: { id: "buyer-1" } });
    publishRealtimeEvent.mockResolvedValue(undefined);
    readCart.mockResolvedValue({ lines: [{ variantId: "v1", optionValues: [] }] });
});

describe("passer commande", () => {
    // Un panier de deux boutiques donne deux commandes : chacune alerte SA boutique.
    it("dépose une commande passée par commande créée, avant la redirection", async () => {
        placeOrders.mockResolvedValue({
            references: ["CMD-A", "CMD-B"],
            orderIds: ["o1", "o2"],
        });

        await expect(submitCheckout({}, form())).rejects.toThrow("NEXT_REDIRECT");

        expect(publishRealtimeEvent).toHaveBeenCalledTimes(2);
        expect(publishRealtimeEvent).toHaveBeenNthCalledWith(1, { kind: "order.placed", orderId: "o1" });
        expect(publishRealtimeEvent).toHaveBeenNthCalledWith(2, { kind: "order.placed", orderId: "o2" });
        expect(redirect).toHaveBeenCalledWith("/orders");
        for (const call of publishRealtimeEvent.mock.invocationCallOrder) {
            expect(call).toBeLessThan(redirect.mock.invocationCallOrder[0] ?? 0);
        }
    });

    // Redis en panne, chaque dépôt attend sa borne avant de rendre la main : l'un après
    // l'autre, un panier de N boutiques ferait attendre l'acheteur N fois.
    it("lance les dépôts ensemble, sans attendre que le précédent rende la main", async () => {
        placeOrders.mockResolvedValue({
            references: ["CMD-A", "CMD-B"],
            orderIds: ["o1", "o2"],
        });
        let release = (): void => undefined;
        publishRealtimeEvent.mockReturnValueOnce(
            new Promise<void>((resolve) => {
                release = resolve;
            }),
        );

        const submitted = submitCheckout({}, form());
        await vi.waitFor(() => expect(publishRealtimeEvent).toHaveBeenCalledTimes(2));
        release();

        await expect(submitted).rejects.toThrow("NEXT_REDIRECT");
    });

    it("dépose une seule commande passée pour une seule commande créée", async () => {
        placeOrders.mockResolvedValue({ references: ["CMD-A"], orderIds: ["o1"] });

        await expect(submitCheckout({}, form())).rejects.toThrow("NEXT_REDIRECT");

        expect(publishRealtimeEvent).toHaveBeenCalledTimes(1);
        expect(publishRealtimeEvent).toHaveBeenCalledWith({ kind: "order.placed", orderId: "o1" });
        expect(redirect).toHaveBeenCalledWith("/orders/CMD-A");
    });

    it("ne dépose rien quand une commande est refusée", async () => {
        for (const code of ["TOTAL_CHANGED", "ORDER_ITEM_INELIGIBLE", "ORDER_METHOD_UNAVAILABLE", "CART_EMPTY"]) {
            placeOrders.mockRejectedValueOnce(new Error(code));
            const state = await submitCheckout({}, form());
            expect(state.error).toBeDefined();
        }

        expect(publishRealtimeEvent).not.toHaveBeenCalled();
    });

    it("ne dépose rien quand l'adresse ou le panier sont refusés avant l'écriture", async () => {
        const invalid = await submitCheckout({}, form({ ...VALID, name: "" }));
        expect(invalid.error).toBe("invalid");

        readCart.mockResolvedValue({ lines: [] });
        const empty = await submitCheckout({}, form());
        expect(empty.error).toBe("cartEmpty");

        expect(placeOrders).not.toHaveBeenCalled();
        expect(publishRealtimeEvent).not.toHaveBeenCalled();
    });

    it("ne dépose rien quand l'écriture lève une panne imprévue", async () => {
        placeOrders.mockRejectedValue(new Error("une panne"));

        await expect(submitCheckout({}, form())).rejects.toThrow("une panne");

        expect(publishRealtimeEvent).not.toHaveBeenCalled();
    });
});
