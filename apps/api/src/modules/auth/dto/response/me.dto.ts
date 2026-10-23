import { Field, ObjectType } from "@nestjs/graphql";
import { AccountDto } from "./account.dto";
import { ShopDto } from "./shop.dto";

@ObjectType("Me", { description: "Qui est connecté, et pour quelle boutique." })
export class MeDto {
    @Field(() => AccountDto)
    user!: AccountDto;

    // `nullable` : un compte peut exister sans boutique, le temps que sa demande soit
    // étudiée. Le téléphone le renvoie alors vers le web, sans erreur.
    @Field(() => ShopDto, {
        nullable: true,
        description: "Absente quand le compte n'est membre d'aucune boutique.",
    })
    shop!: ShopDto | null;
}
