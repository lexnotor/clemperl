import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@clemperl/i18n/messages/vendor/fr.json";

const requireVendorMembership = vi.fn();
const readOrderForVendor = vi.fn();
const setOrderStatus = vi.fn();
const publishRealtimeEvent = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));
vi.mock("../../../lib/session", () => ({
    requireVendorMembership: (...args: unknown[]) => requireVendorMembership(...args),
}));
vi.mock("@clemperl/core", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@clemperl/core")>()),
    publishRealtimeEvent: (...args: unknown[]) => publishRealtimeEvent(...args),
}));
vi.mock("@clemperl/db", () => ({
    prisma: {},
    ERROR_ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
    ERROR_ORDER_STATUS_STALE: "ORDER_STATUS_STALE",
    readOrderForVendor: (...args: unknown[]) => readOrderForVendor(...args),
    setOrderStatus: (...args: unknown[]) => setOrderStatus(...args),
}));

const { advanceOrderAction } = await import("./actions");
const { INITIAL_ORDER_ACTION_STATE } = await import("../types/order-action-state.interface");

function form(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

beforeEach(() => {
    vi.resetAllMocks();
    requireVendorMembership.mockResolvedValue({ vendor: { id: "boutique-1" } });
    readOrderForVendor.mockResolvedValue({ id: "o1", status: "PLACED" });
    setOrderStatus.mockResolvedValue(undefined);
    publishRealtimeEvent.mockResolvedValue(undefined);
});

describe("faire avancer une commande, côté boutique", () => {
    it("écrit pour la boutique de la session, avec l'état LU", async () => {
        const state = await advanceOrderAction(
            INITIAL_ORDER_ACTION_STATE,
            form({ orderId: "o1", action: "ACCEPT" }),
        );

        expect(state.error).toBeNull();
        expect(setOrderStatus).toHaveBeenCalledWith(expect.anything(), {
            vendorId: "boutique-1",
            orderId: "o1",
            from: "PLACED",
            status: "ACCEPTED",
        });
    });

    it("dépose le changement d'état, signé de la boutique, avant la revalidation", async () => {
        await advanceOrderAction(INITIAL_ORDER_ACTION_STATE, form({ orderId: "o1", action: "ACCEPT" }));

        expect(publishRealtimeEvent).toHaveBeenCalledTimes(1);
        expect(publishRealtimeEvent).toHaveBeenCalledWith({
            kind: "order.status_changed",
            orderId: "o1",
            by: "VENDOR",
        });
        expect(publishRealtimeEvent.mock.invocationCallOrder[0]).toBeLessThan(
            revalidatePath.mock.invocationCallOrder[0] ?? 0,
        );
    });

    it("ne dépose rien quand l'écriture est refusée", async () => {
        setOrderStatus.mockRejectedValueOnce(new Error("ORDER_STATUS_STALE"));
        const stale = await advanceOrderAction(
            INITIAL_ORDER_ACTION_STATE,
            form({ orderId: "o1", action: "ACCEPT" }),
        );
        expect(stale.error).toBe(messages.errors.orderMoved);

        setOrderStatus.mockRejectedValueOnce(new Error("ORDER_NOT_FOUND"));
        const gone = await advanceOrderAction(
            INITIAL_ORDER_ACTION_STATE,
            form({ orderId: "o1", action: "ACCEPT" }),
        );
        expect(gone.error).toBe(messages.errors.orderNotFound);

        readOrderForVendor.mockResolvedValue({ id: "o1", status: "SHIPPED" });
        const forbidden = await advanceOrderAction(
            INITIAL_ORDER_ACTION_STATE,
            form({ orderId: "o1", action: "ACCEPT" }),
        );
        expect(forbidden.error).toBe(messages.errors.orderMoved);

        expect(publishRealtimeEvent).not.toHaveBeenCalled();
    });

    it("ne dépose rien quand l'action est inventée ou la commande absente", async () => {
        await advanceOrderAction(INITIAL_ORDER_ACTION_STATE, form({ orderId: "o1", action: "constructor" }));
        readOrderForVendor.mockResolvedValue(null);
        await advanceOrderAction(INITIAL_ORDER_ACTION_STATE, form({ orderId: "o1", action: "ACCEPT" }));

        expect(setOrderStatus).not.toHaveBeenCalled();
        expect(publishRealtimeEvent).not.toHaveBeenCalled();
    });
});
