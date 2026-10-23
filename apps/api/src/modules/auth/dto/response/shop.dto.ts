import { Field, ID, ObjectType } from "@nestjs/graphql";

@ObjectType("Shop", { description: "La boutique dont le compte est membre." })
export class ShopDto {
    @Field(() => ID)
    id!: string;

    @Field({ description: "Le nom de la boutique, tel que les acheteurs le lisent." })
    name!: string;

    @Field({ description: "L'identifiant de la boutique dans ses adresses web." })
    slug!: string;

    // Un booléen et non la date : le téléphone dit si la boutique vend, pas depuis quand
    // elle a cessé. La date reste à l'écran d'administration.
    @Field({ description: "Vrai quand l'administration a suspendu la boutique." })
    suspended!: boolean;
}
