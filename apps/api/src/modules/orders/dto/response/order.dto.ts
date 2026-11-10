import { E_ORDER_STATUS, E_PAYMENT_METHOD, E_PAYMENT_STATUS } from "@clemperl/db/enums";
import {
    E_DISPUTE_NOTICE,
    E_ORDER_ACTION,
    type TDisputeNotice,
    type TOrderAction,
    type TOrderStatus,
    type TPaymentMethod,
} from "@clemperl/domain";
import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";
// Importé pour son effet : les énumérations doivent être enregistrées avant les `@Field`.
import "./order-enums.dto";
import { OrderLineDto } from "./order-line.dto";
import { ShippingAddressDto } from "./shipping-address.dto";

@ObjectType("Order", { description: "Le détail d'une commande de la boutique." })
export class OrderDto {
    @Field(() => ID)
    id!: string;

    @Field({ description: "La référence que la boutique et l'acheteur se citent." })
    reference!: string;

    @Field(() => E_ORDER_STATUS)
    status!: TOrderStatus;

    @Field(() => GraphQLISODateTime, { description: "Le moment où la commande a été passée." })
    placedAt!: Date;

    @Field(() => [OrderLineDto])
    lines!: OrderLineDto[];

    @Field({ description: "Le total, formaté dans la devise de la commande." })
    total!: string;

    @Field(() => E_PAYMENT_METHOD)
    paymentMethod!: TPaymentMethod;

    @Field(() => E_PAYMENT_STATUS)
    paymentStatus!: (typeof E_PAYMENT_STATUS)[keyof typeof E_PAYMENT_STATUS];

    @Field(() => ShippingAddressDto)
    shipTo!: ShippingAddressDto;

    @Field(() => String, {
        nullable: true,
        description: "Le mot laissé par l'acheteur, s'il y en a un.",
    })
    note!: string | null;

    @Field(() => E_DISPUTE_NOTICE, {
        nullable: true,
        description: "Absent quand aucun litige n'attend la boutique.",
    })
    dispute!: TDisputeNotice | null;

    @Field(() => [E_ORDER_ACTION], {
        description: "Les actions que l'état de la commande permet, et aucune autre.",
    })
    actions!: TOrderAction[];
}
