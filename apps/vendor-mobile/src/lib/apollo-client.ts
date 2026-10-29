import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

interface ICreateApolloClientInput {
    apiUrl: string;
    // Le cookie de session, tel que le client Better Auth le garde dans le stockage sécurisé.
    getCookie: () => string | Promise<string>;
    fetch?: typeof globalThis.fetch;
}

// Le client GraphQL du téléphone. La session part dans l'en-tête `Cookie`, que le client Better
// Auth fournit à chaque requête ; `credentials: "omit"` empêche iOS d'y mêler son propre bocal à
// cookies.
//
// Le téléphone n'envoie pas d'`Origin` : `fetch` en React Native n'en pose pas, et `/graphql`
// admet justement une requête sans origine, celle d'un client qui n'est pas un navigateur
// (`docs/graphql.md`, section 6).
export function createApolloClient(input: ICreateApolloClientInput): ApolloClient {
    const baseFetch = input.fetch ?? globalThis.fetch;
    const fetchWithSession: typeof globalThis.fetch = async (url, init) => {
        const headers = new Headers(init?.headers);
        const cookie = await input.getCookie();
        if (cookie !== "") {
            headers.set("Cookie", cookie);
        }
        return baseFetch(url, { ...init, headers, credentials: "omit" });
    };

    return new ApolloClient({
        link: new HttpLink({ uri: `${input.apiUrl}/graphql`, fetch: fetchWithSession }),
        cache: new InMemoryCache(),
    });
}
