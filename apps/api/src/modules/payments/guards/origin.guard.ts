import {
    ForbiddenException,
    Inject,
    Injectable,
    type CanActivate,
    type ExecutionContext,
} from "@nestjs/common";
import { ERROR_ORIGIN_REFUSED } from "../constants";

// Jeton d'injection des origines autorisées, pour la même raison que `AUTH_TOKEN` : Nest
// construit le garde lui-même quand `@UseGuards` le référence par sa classe.
export const ALLOWED_ORIGINS = Symbol("CLEMPERL_ALLOWED_ORIGINS");

// La comparaison est une ÉGALITÉ sur l'origine entière, jamais un préfixe :
// `http://localhost:3000.ailleurs.test` commence comme une origine connue. Un `Origin`
// absent est refusé aussi : un client qui porte un cookie sans dire d'où il vient n'est pas
// un navigateur sur lequel compter.
@Injectable()
export class OriginGuard implements CanActivate {
    constructor(@Inject(ALLOWED_ORIGINS) private readonly allowed: readonly string[]) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<{
            headers: Record<string, string | undefined>;
        }>();
        const origin = request.headers["origin"];
        if (typeof origin !== "string" || !this.allowed.includes(origin)) {
            throw new ForbiddenException(ERROR_ORIGIN_REFUSED);
        }
        return true;
    }
}
