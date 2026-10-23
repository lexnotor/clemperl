import { ForbiddenException, Injectable, type NestMiddleware } from "@nestjs/common";
import { ERROR_GRAPHQL_ORIGIN_REFUSED } from "../constants";
import { graphqlOriginAllowed } from "../utils";

// Un middleware et non un garde : un garde ne s'appliquerait qu'aux résolveurs, après
// qu'Apollo a déjà lu et analysé la requête. Celui-ci refuse avant qu'Apollo ne la voie,
// et Nest le monte devant le pilote, qui ne s'enregistre qu'à l'initialisation des modules.
@Injectable()
export class GraphqlOriginMiddleware implements NestMiddleware {
    use(request: { headers: { origin?: string } }, _response: unknown, next: () => void): void {
        if (!graphqlOriginAllowed(request.headers.origin, process.env)) {
            throw new ForbiddenException(ERROR_GRAPHQL_ORIGIN_REFUSED);
        }
        next();
    }
}
