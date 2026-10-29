import { gql } from "@apollo/client";
import { createApolloClient } from "./apollo-client";

const ME = gql`
    query Me {
        me {
            user {
                email
            }
        }
    }
`;

// Un `fetch` qui note ce qu'on lui envoie et rend une réponse GraphQL valide.
function recordingFetch() {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = jest.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(
            JSON.stringify({
                data: { me: { __typename: "Me", user: { __typename: "Account", email: "a@b.test" } } },
            }),
            { headers: { "Content-Type": "application/json" } },
        );
    });
    return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

const headerOf = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

describe("createApolloClient", () => {
    it("envoie la requête à /graphql, avec le cookie de session et sans origine", async () => {
        const { calls, fetch } = recordingFetch();
        const client = createApolloClient({
            apiUrl: "http://192.0.2.10:3003",
            getCookie: async () => "better-auth.session_token=abc",
            fetch,
        });

        const result = await client.query({ query: ME });

        expect(result.data).toEqual({
            me: { __typename: "Me", user: { __typename: "Account", email: "a@b.test" } },
        });
        const [call] = calls;
        expect(call?.url).toBe("http://192.0.2.10:3003/graphql");
        expect(call?.init.method).toBe("POST");
        expect(headerOf(call!.init, "content-type")).toContain("application/json");
        expect(headerOf(call!.init, "cookie")).toBe("better-auth.session_token=abc");
        // Le cookie part par l'en-tête : iOS ne doit pas y mêler son propre bocal.
        expect(call?.init.credentials).toBe("omit");
        expect(headerOf(call!.init, "origin")).toBeNull();
    });

    it("n'envoie pas d'en-tête Cookie sans session", async () => {
        const { calls, fetch } = recordingFetch();
        const client = createApolloClient({
            apiUrl: "http://192.0.2.10:3003",
            getCookie: () => "",
            fetch,
        });

        await client.query({ query: ME });

        expect(headerOf(calls[0]!.init, "cookie")).toBeNull();
    });
});
