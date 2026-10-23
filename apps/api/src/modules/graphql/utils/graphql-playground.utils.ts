import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import type { ApolloDriverConfig } from "@nestjs/apollo";

type TApolloPlugins = NonNullable<ApolloDriverConfig["plugins"]>;

// Le terrain de jeu, l'introspection et l'origine qu'il envoie se décident ICI, une fois.
// C'est la règle que le pilote Apollo applique par défaut à sa propre page ; écrite ici, elle
// ne peut plus s'allumer d'un côté et s'éteindre de l'autre.
export function graphqlPlaygroundEnabled(env: NodeJS.ProcessEnv): boolean {
    return env["NODE_ENV"] !== "production";
}

// Le terrain de jeu est Apollo Sandbox, choisi par le propriétaire pour son interface : on y
// compose une requête en cliquant les champs du schéma. Son interface vient d'une iframe
// d'Apollo, mais ses REQUÊTES partent de la page qui l'héberge, servie par l'API : elles
// portent donc l'origine de l'API, que le filtre admet hors production, et la session de la
// boutique les accompagne. D'où `includeCookies`, sans lequel `me` serait refusé à un vendeur
// connecté.
//
// La télémétrie est coupée : Sandbox enverrait sinon ses statistiques d'usage à Apollo, dont
// ce dépôt n'a aucun usage.
//
// En production, aucune page : le pilote pose alors le marqueur qui éteint aussi celle
// qu'Apollo installerait d'office.
export function graphqlLandingPagePlugins(env: NodeJS.ProcessEnv): TApolloPlugins {
    if (!graphqlPlaygroundEnabled(env)) {
        return [];
    }
    const sandbox = ApolloServerPluginLandingPageLocalDefault({
        embed: { runTelemetry: false },
        includeCookies: true,
    });
    // La conversion ne change rien à l'objet. L'API, compilée en CommonJS, lit les types de
    // `@apollo/server` dans sa version CommonJS ; le pilote, publié en ESM pur, dans sa
    // version ESM. Ce sont deux déclarations du même paquet, que TypeScript tient pour
    // distinctes, alors que le plugin n'est qu'un objet de crochets qu'Apollo appelle.
    return [sandbox as unknown as TApolloPlugins[number]];
}
