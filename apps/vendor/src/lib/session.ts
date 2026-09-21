import { auth } from "@clemperl/auth";
import { prisma, readVendorForMember } from "@clemperl/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const STOREFRONT = process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "";

// Appelée EXPLICITEMENT en tête de chaque page et de chaque server action, jamais posée
// dans un layout. Un layout ne s'interpose pas de façon garantie devant tout ce qu'il
// enveloppe, et une garde qui SEMBLE protéger est pire qu'une garde absente.
export async function requireVendorMembership() {
    // La connexion vit sur la boutique, et le cookie est partagé : se connecter là vaut
    // ici.
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
        redirect(`${STOREFRONT}/sign-in`);
    }

    const vendor = await readVendorForMember(prisma, session.user.id);

    // L'administration répond `notFound()` à un intrus, pour ne pas lui confirmer que la
    // route existe. Ici c'est l'inverse : l'espace vendeur est public par destination,
    // n'importe qui peut en devenir un, et celui qui arrive là est le plus souvent un
    // candidat dont le dossier est encore à l'étude. Un 404 ne protégerait rien et le
    // laisserait devant une porte muette.
    if (!vendor) {
        redirect(`${STOREFRONT}/become-a-vendor`);
    }

    return { session, vendor };
}
