import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType("ShippingAddress", { description: "Où la commande est expédiée, et à qui." })
export class ShippingAddressDto {
    @Field({ description: "Le nom de la personne qui reçoit." })
    name!: string;

    @Field({ description: "La rue et le numéro." })
    line!: string;

    @Field()
    city!: string;

    @Field()
    country!: string;

    @Field({ description: "Le numéro où joindre la personne, pour la livraison." })
    phone!: string;
}
