import {
    Inject,
    Injectable,
    UnauthorizedException,
    type CanActivate,
    type ExecutionContext,
} from "@nestjs/common";
import type { auth as InstanceAuth } from "@clemperl/auth";

// Jeton d'injection de l'instance Better Auth. Nest construit le garde lui-même quand
// `@UseGuards` le référence par sa classe : lui fournir l'instance par un jeton, plutôt
// que par un `useValue` sur le garde, laisse cette construction fonctionner.
export const JETON_AUTH = Symbol("CLEMPERL_AUTH");

// L'API ne vérifie aucun jeton elle-même : elle demande la session à la même instance
// Better Auth que les applications Next. Une vérification écrite ici devrait être tenue
// synchrone avec le format de la bibliothèque à chacune de ses mises à jour, et une
// divergence produirait des sessions acceptées d'un côté et refusées de l'autre.
@Injectable()
export class SessionGuard implements CanActivate {
    constructor(@Inject(JETON_AUTH) private readonly instance: typeof InstanceAuth) {}

    async canActivate(contexte: ExecutionContext): Promise<boolean> {
        const requete = contexte.switchToHttp().getRequest<{
            headers: Record<string, string>;
            session?: unknown;
        }>();

        const session = await this.instance.api.getSession({
            headers: new Headers(requete.headers),
        });

        if (!session) {
            throw new UnauthorizedException("Session absente ou expirée.");
        }

        // La session est attachée à la requête : les contrôleurs la lisent sans
        // redemander à la base ce qui vient d'être vérifié.
        requete.session = session;
        return true;
    }
}
