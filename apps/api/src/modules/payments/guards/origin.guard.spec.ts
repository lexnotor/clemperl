import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ERROR_ORIGIN_REFUSED } from "../constants";
import { ALLOWED_ORIGINS, OriginGuard } from "./origin.guard";

const context = (headers: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as never;

describe("OriginGuard", () => {
    const guard = new OriginGuard(["http://localhost:3000", "http://localhost:3001"]);

    it("se laisse construire par Nest quand les origines ont leur jeton", async () => {
        // `@UseGuards(OriginGuard)` fait construire le garde par Nest, qui résout son
        // constructeur : sans le jeton, l'injection échouerait à l'exécution.
        const module = await Test.createTestingModule({
            providers: [OriginGuard, { provide: ALLOWED_ORIGINS, useValue: ["http://a.test"] }],
        }).compile();

        expect(module.get(OriginGuard)).toBeInstanceOf(OriginGuard);
    });

    it("laisse passer une origine connue", () => {
        expect(guard.canActivate(context({ origin: "http://localhost:3000" }))).toBe(true);
    });

    // Une écriture entre deux origines depuis un navigateur est la surface que Better Auth
    // protège sur ses propres routes. Les nôtres la protègent elles-mêmes.
    it("refuse une origine inconnue, en rendant un code et non une phrase", () => {
        expect(() => guard.canActivate(context({ origin: "http://ailleurs.test" }))).toThrow(
            ForbiddenException,
        );
        expect(() => guard.canActivate(context({ origin: "http://ailleurs.test" }))).toThrow(
            expect.objectContaining({ message: ERROR_ORIGIN_REFUSED }),
        );
    });

    // Un `Origin` absent est précisément ce qu'une session portée sans origine donnerait :
    // un client qui envoie un cookie et ne dit pas d'où il vient. Le refuser est un refus,
    // pas un oubli.
    it("refuse une requête sans origine", () => {
        expect(() => guard.canActivate(context({}))).toThrow(ForbiddenException);
    });

    it("refuse une origine qui commence comme une origine connue", () => {
        expect(() =>
            guard.canActivate(context({ origin: "http://localhost:3000.ailleurs.test" })),
        ).toThrow(ForbiddenException);
    });

    it("refuse l'origine opaque que certains navigateurs envoient", () => {
        expect(() => guard.canActivate(context({ origin: "null" }))).toThrow(ForbiddenException);
    });
});
