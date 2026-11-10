import { prisma, readVendorForMember } from "@clemperl/db";
import {
    ForbiddenException,
    Injectable,
    type CanActivate,
    type ExecutionContext,
} from "@nestjs/common";
import type { ISessionRequest } from "../interfaces";
import { requestOf } from "../utils";

// Une garde à part, et non une seconde lecture dans `SessionGuard` : `me` doit répondre à un
// compte sans boutique, les lectures de boutique non. Elle se pose APRÈS `SessionGuard`, qui
// attache la session qu'elle lit.
//
// `FORBIDDEN` plutôt qu'une liste vide : le téléphone n'interroge jamais sans boutique, son
// accueil l'arrête avant. Si l'appartenance disparaît pendant que l'application est ouverte,
// une liste vide s'afficherait comme « aucune commande » et cacherait que le compte n'a plus
// rien à lire ; l'erreur ramène l'écran à l'accueil. Les écritures réutilisent cette garde.
//
// La boutique est lue par la fonction même dont `me` et l'espace vendeur web se servent : les
// trois ne peuvent pas désigner deux boutiques pour un même compte.
@Injectable()
export class ShopGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = requestOf(context);
        // `SessionGuard` a posé la session : sans lui avant, cette lecture échouerait.
        const { user } = (request as unknown as ISessionRequest).session;

        const vendor = await readVendorForMember(prisma, user.id);
        if (vendor === null) {
            throw new ForbiddenException("Aucune boutique pour ce compte.");
        }

        // Seul l'identifiant est attaché : un résolveur borne sa lecture par lui, il n'a pas
        // besoin de la ligne entière.
        request.shop = { id: vendor.id };
        return true;
    }
}
