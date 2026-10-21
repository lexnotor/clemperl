import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TRealtimeEvent } from "../interfaces/realtime-event.interface.js";

const add = vi.fn();
const on = vi.fn();
const Queue = vi.fn(function () {
    return { add, on };
});

vi.mock("bullmq", () => ({ Queue }));

const event = { kind: "order-status" } as unknown as TRealtimeEvent;

// La file est un singleton de module : chaque test repart d'un module neuf.
async function load() {
    vi.resetModules();
    return import("./realtime-publisher.utils.js");
}

describe("publishRealtimeEvent", () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        on.mockReset();
        add.mockReset().mockResolvedValue(undefined);
        Queue.mockClear();
        vi.stubEnv("REDIS_URL", "redis://redis:6379");
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        consoleError.mockRestore();
    });

    it("dépose l'événement tel quel sur la file des événements temps réel", async () => {
        const { publishRealtimeEvent } = await load();

        await publishRealtimeEvent(event);

        expect(Queue).toHaveBeenCalledWith(
            "realtime-events",
            expect.objectContaining({ connection: expect.objectContaining({ host: "redis" }) }),
        );
        expect(add).toHaveBeenCalledWith("realtime-events", event, {
            attempts: 3,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: true,
            removeOnFail: 100,
        });
        expect(consoleError).not.toHaveBeenCalled();
    });

    it("n'ouvre qu'une file pour deux dépôts", async () => {
        const { publishRealtimeEvent } = await load();

        await publishRealtimeEvent(event);
        await publishRealtimeEvent(event);

        expect(Queue).toHaveBeenCalledTimes(1);
        expect(add).toHaveBeenCalledTimes(2);
    });

    it("résout sans rejeter quand le dépôt échoue, et journalise", async () => {
        const failure = new Error("Redis injoignable");
        add.mockRejectedValue(failure);
        const { publishRealtimeEvent } = await load();

        await expect(publishRealtimeEvent(event)).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalledWith("publishRealtimeEvent", failure);
    });

    it("résout sans rejeter quand REDIS_URL est absente, et journalise", async () => {
        vi.stubEnv("REDIS_URL", "");
        const { publishRealtimeEvent } = await load();

        await expect(publishRealtimeEvent(event)).resolves.toBeUndefined();

        expect(Queue).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledWith("publishRealtimeEvent", expect.any(Error));
    });

    it("résout et journalise quand le dépôt ne se termine jamais, sans timer résiduel", async () => {
        vi.useFakeTimers();
        add.mockReturnValue(new Promise(() => undefined));
        const { publishRealtimeEvent } = await load();

        const publishing = publishRealtimeEvent(event);
        await vi.advanceTimersByTimeAsync(2000);

        await expect(publishing).resolves.toBeUndefined();
        expect(consoleError).toHaveBeenCalledWith("publishRealtimeEvent", expect.any(Error));
        expect(vi.getTimerCount()).toBe(0);
    });

    it("ne journalise rien et ne laisse aucun timer quand le dépôt aboutit vite", async () => {
        vi.useFakeTimers();
        const { publishRealtimeEvent } = await load();

        await publishRealtimeEvent(event);

        expect(vi.getTimerCount()).toBe(0);
        expect(consoleError).not.toHaveBeenCalled();
    });

    it("écoute les erreurs de la file et les journalise", async () => {
        const { publishRealtimeEvent } = await load();
        await publishRealtimeEvent(event);

        expect(on).toHaveBeenCalledWith("error", expect.any(Function));
        const handler = on.mock.calls[0]?.[1] as (error: Error) => void;
        const failure = new Error("ECONNREFUSED");
        handler(failure);

        expect(consoleError).toHaveBeenCalledWith("realtimeQueue", failure);
    });
});
