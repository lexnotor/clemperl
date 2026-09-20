import { auth } from "@clemperl/auth";
import { prisma } from "@clemperl/db";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

const STOREFRONT = process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "";

// Appelée EXPLICITEMENT en tête de chaque page et de chaque server action, jamais posée
// dans un layout. Un layout ne s'interpose pas de façon garantie devant tout ce qu'il
// enveloppe, et une garde qui SEMBLE protéger est pire qu'une garde absente.
export async function requireAdministrator() {
    // Sur une base vierge, renvoyer vers la connexion mènerait à un formulaire qu'aucun
    // compte ne peut passer : c'est l'amorçage qu'il faut proposer.
    if ((await prisma.user.count({ where: { role: "ADMIN" } })) === 0) {
        redirect("/setup");
    }

    const session = await auth.api.getSession({ headers: await headers() });

    // La connexion vit sur la boutique, et le cookie est partagé : se connecter là vaut
    // ici. Aucune destination de retour n'est transmise — elle traverserait une origine,
    // et la boutique refuse par principe les redirections externes.
    if (!session) {
        redirect(`${STOREFRONT}/sign-in`);
    }

    // `notFound()` et non une page « interdit » : répondre 403 confirmerait à un compte
    // ordinaire que la route existe.
    if (session.user.role !== "ADMIN") {
        notFound();
    }

    return session;
}
