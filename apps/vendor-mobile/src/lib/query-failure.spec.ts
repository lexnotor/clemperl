import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { queryFailure } from "./query-failure";

const graphqlError = (code: string) =>
    new CombinedGraphQLErrors({ data: null, errors: [{ message: "refus", extensions: { code } }] });

describe("queryFailure", () => {
    it("classe UNAUTHENTICATED en session refusée", () => {
        expect(queryFailure(graphqlError("UNAUTHENTICATED"))).toBe("signed-out");
    });

    // `ShopGuard` répond FORBIDDEN à un compte qui n'a pas ou plus de boutique.
    it("classe FORBIDDEN en compte sans boutique", () => {
        expect(queryFailure(graphqlError("FORBIDDEN"))).toBe("no-shop");
    });

    it("classe tout autre code en injoignable", () => {
        expect(queryFailure(graphqlError("INTERNAL_SERVER_ERROR"))).toBe("unreachable");
    });

    it("classe une erreur réseau en injoignable", () => {
        expect(queryFailure(new TypeError("Network request failed"))).toBe("unreachable");
    });
});
