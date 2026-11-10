import { Field, ID, Int, ObjectType } from "@nestjs/graphql";

@ObjectType("OrderLine", { description: "Une ligne d'une commande, telle qu'elle a été achetée." })
export class OrderLineDto {
    @Field(() => ID)
    id!: string;

    @Field({ description: "Le titre du produit au moment de l'achat." })
    title!: string;

    @Field({ description: "Le libellé de la variante achetée, par exemple sa taille." })
    variantLabel!: string;

    @Field(() => Int)
    quantity!: number;

    @Field({ description: "Le prix de la ligne, formaté dans la devise de la commande." })
    total!: string;
}
