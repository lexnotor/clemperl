import { ForbiddenException } from "@nestjs/common";
import { ERROR_GRAPHQL_ORIGIN_REFUSED } from "../constants";
import { GraphqlOriginMiddleware } from "./graphql-origin.middleware";

const request = (origin?: string) =>
    ({ headers: origin === undefined ? {} : { origin } }) as never;

describe("GraphqlOriginMiddleware", () => {
    const middleware = new GraphqlOriginMiddleware();

    it("laisse passer une requête admise", () => {
        const next = jest.fn();

        middleware.use(request(), {} as never, next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it("refuse une origine inconnue par un code, sans aller plus loin", () => {
        const next = jest.fn();

        let refusal: unknown;
        try {
            middleware.use(request("https://ailleurs.test"), {} as never, next);
        } catch (error) {
            refusal = error;
        }

        expect(refusal).toBeInstanceOf(ForbiddenException);
        expect((refusal as ForbiddenException).message).toBe(ERROR_GRAPHQL_ORIGIN_REFUSED);
        expect(next).not.toHaveBeenCalled();
    });
});
