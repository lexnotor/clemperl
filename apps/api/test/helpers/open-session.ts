import { auth } from "@clemperl/auth";
import { prisma } from "@clemperl/db";

const PASSWORD = "motdepasse123";

// Ouvre une vraie session et rend son cookie. Fabriquer un jeton à la main ne
// prouverait rien : ce qu'on veut vérifier, c'est que l'API reconnaît le cookie que
// Better Auth émet réellement, avec la signature et le format qu'il lui donne.
export async function openSession(email: string): Promise<string> {
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Essai" } });
    // La vérification de l'adresse est obligatoire : sans ce passage, la connexion
    // renvoie 403 et le test mesurerait la mauvaise chose.
    await prisma.user.update({ where: { email }, data: { emailVerified: true } });

    const response = await auth.api.signInEmail({
        body: { email, password: PASSWORD },
        asResponse: true,
    });
    const cookie = response.headers.get("set-cookie");
    if (!cookie) {
        throw new Error("la connexion n'a produit aucun cookie de session");
    }
    // Seul le premier segment porte le couple nom=valeur ; le reste (`Path`, `HttpOnly`,
    // `SameSite`) n'a pas sa place dans un en-tête `Cookie` de requête.
    const [pair = cookie] = cookie.split(";");
    return pair;
}
