import {
    Inject,
    Injectable,
    UnauthorizedException,
    type CanActivate,
    type ExecutionContext,
} from "@nestjs/common";
import type { auth as InstanceAuth } from "@clemperl/auth";
import { GqlExecutionContext, type GqlContextType } from "@nestjs/graphql";

// Jeton d'injection de l'instance Better Auth. Nest construit le garde lui-même quand
// `@UseGuards` le référence par sa classe : lui fournir l'instance par un jeton, plutôt
// que par un `useValue` sur le garde, laisse cette construction fonctionner.
export const AUTH_TOKEN = Symbol("CLEMPERL_AUTH");

// L'API ne vérifie aucun jeton elle-même : elle demande la session à la même instance
// Better Auth que les applications Next. Une vérification écrite ici devrait être tenue
// synchrone avec le format de la bibliothèque à chacune de ses mises à jour, et une
// divergence produirait des sessions acceptées d'un côté et refusées de l'autre.
@Injectable()
export class SessionGuard implements CanActivate {
    constructor(@Inject(AUTH_TOKEN) private readonly instance: typeof InstanceAuth) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = requestOf(context);

        const session = await this.instance.api.getSession({
            headers: new Headers(request.headers),
        });

        if (!session) {
            throw new UnauthorizedException("Session absente ou expirée.");
        }

        // La session est attachée à la requête : les contrôleurs et les résolveurs la lisent
        // sans redemander à la base ce qui vient d'être vérifié.
        request.session = session;
        return true;
    }
}

interface IGuardedRequest {
    headers: Record<string, string>;
    session?: unknown;
}

// UN garde pour REST et GraphQL, et non un garde par transport : la règle « une session,
// demandée à la même instance Better Auth » resterait sinon écrite deux fois. Seul l'accès
// à la requête diffère : un résolveur la reçoit dans son contexte GraphQL, où le pilote
// Apollo la dépose sous `req`.
function requestOf(context: ExecutionContext): IGuardedRequest {
    if (context.getType<GqlContextType>() === "graphql") {
        return GqlExecutionContext.create(context).getContext<{ req: IGuardedRequest }>().req;
    }
    return context.switchToHttp().getRequest<IGuardedRequest>();
}
