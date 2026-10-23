import { prisma, readVendorForMember } from "@clemperl/db";
import { UseGuards } from "@nestjs/common";
import { Context, Query, Resolver } from "@nestjs/graphql";
import { MeDto } from "../dto/response";
import { SessionGuard } from "../guards";
import type { ISessionRequest } from "../interfaces";

@Resolver(() => MeDto)
export class MeResolver {
    // La boutique est lue par la fonction même dont `requireVendorMembership` se sert sur
    // l'espace vendeur web : le téléphone et le web ne peuvent pas désigner deux boutiques
    // différentes pour un même compte, ni montrer une boutique supprimée.
    @Query(() => MeDto, { name: "me", description: "Le compte connecté et sa boutique." })
    @UseGuards(SessionGuard)
    async me(@Context("req") request: ISessionRequest): Promise<MeDto> {
        const { id, email, name } = request.session.user;
        const vendor = await readVendorForMember(prisma, id);

        // Champ par champ, jamais la session ni le vendeur tels quels : le type GraphQL filtre
        // déjà la réponse, mais un objet recopié en entier ferait passer au client, le jour
        // où un champ s'ajoute au type, ce que personne n'a décidé d'exposer.
        return {
            user: { id, email, name },
            shop:
                vendor === null
                    ? null
                    : {
                          id: vendor.id,
                          name: vendor.shopName,
                          slug: vendor.slug,
                          suspended: vendor.suspendedAt !== null,
                      },
        };
    }
}
