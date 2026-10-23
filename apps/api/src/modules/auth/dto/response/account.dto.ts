import { Field, ID, ObjectType } from "@nestjs/graphql";

@ObjectType("Account", { description: "Le compte connecté, tel que le téléphone l'affiche." })
export class AccountDto {
    @Field(() => ID)
    id!: string;

    @Field({ description: "Le nom donné à l'inscription." })
    name!: string;

    @Field({ description: "L'adresse de connexion." })
    email!: string;
}
