import { listOrdersForVendor, prisma, readOrderForVendor } from "@clemperl/db";
import { allowedOrderActions, disputeNotice, formatPrice } from "@clemperl/domain";
import { UseGuards } from "@nestjs/common";
import { Args, Context, ID, Query, Resolver } from "@nestjs/graphql";
import { SessionGuard, ShopGuard } from "../../auth/guards";
import type { IShopRequest } from "../../auth/interfaces";
import { OrderDto, OrderSummaryDto } from "../dto/response";

@Resolver(() => OrderSummaryDto)
export class OrdersResolver {
    // Les deux gardes DANS CET ORDRE : la seconde lit la session que la première attache.
    @Query(() => [OrderSummaryDto], {
        name: "orders",
        description: "Les commandes de la boutique du compte, la plus récente en tête.",
    })
    @UseGuards(SessionGuard, ShopGuard)
    async orders(@Context("req") request: IShopRequest): Promise<OrderSummaryDto[]> {
        const rows = await listOrdersForVendor(prisma, request.shop.id);

        // Champ par champ, comme `MeResolver` : `paymentMethod` et le reste de la ligne ne
        // sont pas au contrat, et ne doivent pas y arriver le jour où le type s'élargit.
        return rows.map((row) => ({
            id: row.id,
            reference: row.reference,
            customerName: row.shipToName,
            status: row.status,
            paymentStatus: row.paymentStatus,
            total: formatPrice(row.totalAmount, row.currency),
            placedAt: row.createdAt,
            dispute: disputeNotice(row.dispute?.status ?? null),
        }));
    }

    // `null` et non une erreur : répondre « interdit » ou « introuvable » pour la commande d'une
    // autre boutique confirmerait qu'elle existe (spec T8, section 4). Le dépôt filtre par
    // boutique dans sa signature, donc l'autre boutique, l'identifiant inventé et la commande
    // absente reçoivent la même réponse.
    @Query(() => OrderDto, {
        name: "order",
        nullable: true,
        description: "Une commande de la boutique du compte, ou rien si elle n'est pas à elle.",
    })
    @UseGuards(SessionGuard, ShopGuard)
    async order(
        @Context("req") request: IShopRequest,
        @Args("id", { type: () => ID }) id: string,
    ): Promise<OrderDto | null> {
        const row = await readOrderForVendor(prisma, { vendorId: request.shop.id, orderId: id });
        if (row === null) {
            return null;
        }

        // Champ par champ, comme `orders` : les tentatives de paiement, `imagePath` et le reste
        // de la ligne du dépôt restent sur le web.
        return {
            id: row.id,
            reference: row.reference,
            status: row.status,
            placedAt: row.createdAt,
            lines: row.items.map((line) => ({
                id: line.id,
                title: line.productTitle,
                variantLabel: line.variantLabel,
                quantity: line.quantity,
                total: formatPrice(line.unitAmount * line.quantity, row.currency),
            })),
            total: formatPrice(row.totalAmount, row.currency),
            paymentMethod: row.paymentMethod,
            paymentStatus: row.paymentStatus,
            shipTo: {
                name: row.shipToName,
                line: row.shipToLine,
                city: row.shipToCity,
                country: row.shipToCountry,
                phone: row.shipToPhone,
            },
            note: row.note,
            dispute: disputeNotice(row.dispute?.status ?? null),
            // Les mêmes actions que les boutons de la page web, par la même règle du domaine.
            actions: allowedOrderActions(row.status),
        };
    }
}
