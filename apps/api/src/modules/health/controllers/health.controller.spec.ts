import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
    let controller: HealthController;

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [HealthController],
        }).compile();
        controller = module.get(HealthController);
    });

    it("annonce l'application et son état", () => {
        expect(controller.lire()).toEqual({ statut: "ok", application: "api" });
    });
});
