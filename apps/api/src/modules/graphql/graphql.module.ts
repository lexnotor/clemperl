import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { GraphqlOriginMiddleware } from "./middlewares";
import { graphqlLandingPagePlugins, graphqlPlaygroundEnabled } from "./utils";

// Le point d'entrée GraphQL de l'API, que le téléphone appelle ; les fronts web n'y passent
// pas. Les résolveurs vivent dans leurs modules métier, à côté de leurs contrôleurs : Nest
// les trouve parmi les providers de toute l'application.
//
// `ApiGraphqlModule` et non `GraphqlModule` : un nom qu'une lettre sépare de `GraphQLModule`,
// qu'il configure, se confondrait à la lecture.
const playground = graphqlPlaygroundEnabled(process.env);

@Module({
    imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
            driver: ApolloDriver,
            path: "/graphql",
            // Le schéma est tenu en mémoire et TRIÉ : le fichier versionné en est une
            // impression, faite par `schema:print`, et l'ordre ne bouge pas d'une impression à
            // l'autre.
            autoSchemaFile: true,
            sortSchema: true,
            // GraphiQL, la page du pilote, est éteint : le terrain de jeu est Apollo Sandbox,
            // servi par `graphqlLandingPagePlugins` hors production, et par rien en production.
            graphiql: false,
            plugins: graphqlLandingPagePlugins(process.env),
            introspection: playground,
        }),
    ],
})
export class ApiGraphqlModule implements NestModule {
    // Toutes les méthodes : la page du terrain de jeu est un `GET`, les requêtes des `POST`, et
    // le filtre doit voir les deux.
    //
    // Et tous les sous-chemins, d'où `{/*rest}` : Nest lie `forRoutes` à une route EXACTE, alors
    // que le pilote monte Apollo par préfixe, `app.use("/graphql", ...)`. Avec `"graphql"` seul,
    // `/graphql/x` exécutait la requête sans passer par le filtre. Ne pas retirer le joker.
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(GraphqlOriginMiddleware)
            .forRoutes({ path: "graphql{/*rest}", method: RequestMethod.ALL });
    }
}
