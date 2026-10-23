import { graphqlOriginAllowed } from "./graphql-origin.utils";

const API = "http://localhost:3003";
const development = { NODE_ENV: "development", NEXT_PUBLIC_API_URL: API };
const production = { NODE_ENV: "production", NEXT_PUBLIC_API_URL: API };

describe("graphqlOriginAllowed", () => {
    it("accepte une requête sans origine, celle du téléphone", () => {
        expect(graphqlOriginAllowed(undefined, development)).toBe(true);
        expect(graphqlOriginAllowed(undefined, production)).toBe(true);
    });

    it("accepte l'origine du terrain de jeu hors production", () => {
        expect(graphqlOriginAllowed(API, development)).toBe(true);
    });

    // L'API sert d'autres pages dans un navigateur, le simulateur de paiement entre autres :
    // sans terrain de jeu, son origine n'a plus aucune raison d'appeler GraphQL.
    it("refuse l'origine du terrain de jeu en production", () => {
        expect(graphqlOriginAllowed(API, production)).toBe(false);
    });

    it("refuse l'origine d'un front, qui n'appelle pas GraphQL", () => {
        expect(graphqlOriginAllowed("http://localhost:3000", development)).toBe(false);
    });

    // `null` est ce qu'envoie un document isolé, une iframe `sandbox` par exemple : une
    // origine présente, donc un navigateur, que rien ne désigne.
    it("refuse null, une chaîne vide et un préfixe trompeur", () => {
        expect(graphqlOriginAllowed("null", development)).toBe(false);
        expect(graphqlOriginAllowed("", development)).toBe(false);
        expect(graphqlOriginAllowed("http://localhost:3003.ailleurs.test", development)).toBe(
            false,
        );
    });

    it("refuse toute origine quand l'adresse de l'API est absente", () => {
        expect(graphqlOriginAllowed(API, { NODE_ENV: "development" })).toBe(false);
    });
});
