import { CombinedGraphQLErrors } from "@apollo/client/errors";
import { meState } from "./me-state";

const graphqlError = (code: string) =>
    new CombinedGraphQLErrors({ data: null, errors: [{ message: "refus", extensions: { code } }] });

const me = (shop: { name: string; suspended: boolean } | null) => ({
    me: {
        __typename: "Me" as const,
        user: { __typename: "Account" as const, email: "awa@atelier.test" },
        shop: shop === null ? null : { __typename: "Shop" as const, ...shop },
    },
});

describe("meState", () => {
    it("attend tant que la requête court", () => {
        expect(meState({ loading: true })).toEqual({ kind: "loading" });
    });

    // La session gardée par le téléphone a pu expirer ou être révoquée : le serveur ne la
    // reconnaît plus, et l'application revient à la connexion sans message technique.
    it("renvoie à la connexion sur UNAUTHENTICATED", () => {
        expect(meState({ loading: false, error: graphqlError("UNAUTHENTICATED") })).toEqual({
            kind: "signed-out",
        });
    });

    it("dit l'API injoignable sur une erreur réseau", () => {
        expect(meState({ loading: false, error: new TypeError("Network request failed") })).toEqual(
            { kind: "unreachable" },
        );
    });

    // Une autre erreur du serveur ne déconnecte pas : la session est peut-être bonne, c'est la
    // réponse qui manque, et réessayer est le bon geste.
    it("ne déconnecte pas sur une autre erreur GraphQL", () => {
        expect(meState({ loading: false, error: graphqlError("INTERNAL_SERVER_ERROR") })).toEqual({
            kind: "unreachable",
        });
    });

    it("distingue un compte sans boutique", () => {
        expect(meState({ loading: false, data: me(null) })).toEqual({
            kind: "no-shop",
            email: "awa@atelier.test",
        });
    });

    it("rend la boutique, suspendue ou non", () => {
        expect(meState({ loading: false, data: me({ name: "Atelier Awa", suspended: false }) })).toEqual({
            kind: "ready",
            email: "awa@atelier.test",
            shop: { name: "Atelier Awa", suspended: false },
        });
        expect(
            meState({ loading: false, data: me({ name: "Atelier Awa", suspended: true }) }),
        ).toMatchObject({ kind: "ready", shop: { suspended: true } });
    });
});
