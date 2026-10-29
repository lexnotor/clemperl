import { graphql } from "../../graphql/generated";

// Ce que l'accueil demande à l'API : qui est connecté, et sa boutique. Le type de la réponse
// est généré depuis ce texte et le schéma de l'API, par `pnpm codegen`.
export const ME_QUERY = graphql(`
    query Me {
        me {
            user {
                email
            }
            shop {
                name
                suspended
            }
        }
    }
`);
