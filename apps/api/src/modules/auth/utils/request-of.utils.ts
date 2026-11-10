import type { ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext, type GqlContextType } from "@nestjs/graphql";
import type { IGuardedRequest } from "../interfaces";

// UN lecteur pour REST et GraphQL, et non un par transport : la règle « une session, demandée
// à la même instance Better Auth » resterait sinon écrite deux fois. Seul l'accès à la requête
// diffère : un résolveur la reçoit dans son contexte GraphQL, où le pilote Apollo la dépose
// sous `req`. Les gardes qui s'enchaînent la lisent par ici, et voient donc la même requête.
export function requestOf(context: ExecutionContext): IGuardedRequest {
    if (context.getType<GqlContextType>() === "graphql") {
        return GqlExecutionContext.create(context).getContext<{ req: IGuardedRequest }>().req;
    }
    return context.switchToHttp().getRequest<IGuardedRequest>();
}
