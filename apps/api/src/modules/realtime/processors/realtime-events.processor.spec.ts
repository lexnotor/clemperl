import type { TRealtimeEvent } from "@clemperl/core";
import { readOrderAudience } from "@clemperl/db";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import type { RealtimeGateway } from "../controllers";
import { RealtimeService } from "../services";
import { RealtimeEventsProcessor } from "./realtime-events.processor";

jest.mock("@clemperl/db", () => ({
    ...jest.requireActual("@clemperl/db"),
    prisma: { marker: "prisma" },
    readOrderAudience: jest.fn(),
}));

const EVENT: TRealtimeEvent = { kind: "order.status_changed", orderId: "order-1", by: "VENDOR" };

const job = (data: TRealtimeEvent) => ({ data }) as Job<TRealtimeEvent>;

beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("RealtimeEventsProcessor", () => {
    it("passe l'événement du job au service, tel que déposé", async () => {
        const publish = jest.fn().mockResolvedValue(undefined);
        const processor = new RealtimeEventsProcessor({ publish } as unknown as RealtimeService);

        await processor.process(job(EVENT));

        expect(publish).toHaveBeenCalledWith(EVENT);
    });

    // BullMQ ne relance un job que si `process` lève. Un objet disparu entre le dépôt et la
    // consommation ne doit donc pas lever : relancer ne le ferait pas réapparaître.
    it("termine sans lever le job d'un objet disparu, que la file ne relance donc pas", async () => {
        jest.mocked(readOrderAudience).mockResolvedValue(null);
        const emitTo = jest.fn();
        const processor = new RealtimeEventsProcessor(
            new RealtimeService({ emitTo } as unknown as RealtimeGateway),
        );

        await expect(processor.process(job(EVENT))).resolves.toBeUndefined();

        expect(emitTo).not.toHaveBeenCalled();
    });
});
