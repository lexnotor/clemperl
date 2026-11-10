import { E_ORDER_STATUS, E_PAYMENT_STATUS } from "@clemperl/db/enums";
import { E_DISPUTE_NOTICE, type TDisputeNotice, type TOrderStatus } from "@clemperl/domain";
import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";
// Importé pour son effet : les énumérations doivent être enregistrées avant les `@Field`.
import "./order-enums.dto";

@ObjectType("OrderSummary", { description: "Une commande, telle qu'une liste l'affiche." })
export class OrderSummaryDto {
    @Field(() => ID)
    id!: string;

    @Field({ description: "La référence que la boutique et l'acheteur se citent." })
    reference!: string;

    @Field({ description: "Le nom de la personne à qui la commande est expédiée." })
    customerName!: string;

    @Field(() => E_ORDER_STATUS)
    status!: TOrderStatus;

    @Field(() => E_PAYMENT_STATUS)
    paymentStatus!: (typeof E_PAYMENT_STATUS)[keyof typeof E_PAYMENT_STATUS];

    // Une chaîne déjà formatée, dans la devise de la commande : le nombre de décimales dépend
    // de la devise, et le téléphone ne recopie pas cette règle. L'API formate donc, en français
    // pour l'instant, faute de connaître la langue du téléphone.
    @Field({ description: "Le total, formaté dans la devise de la commande." })
    total!: string;

    @Field(() => GraphQLISODateTime, { description: "Le moment où la commande a été passée." })
    placedAt!: Date;

    @Field(() => E_DISPUTE_NOTICE, {
        nullable: true,
        description: "Absent quand aucun litige n'attend la boutique.",
    })
    dispute!: TDisputeNotice | null;
}
