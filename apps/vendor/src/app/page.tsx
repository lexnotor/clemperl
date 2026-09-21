import { auth } from "@clemperl/auth";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { headers } from "next/headers";
import Link from "next/link";
import type { JSX } from "react";

// Cette page lit la session : elle ne peut pas être pré-rendue au build. Sans
// `force-dynamic`, Next sert un rendu figé, et un utilisateur qui vient de se
// déconnecter continue d'y voir son adresse.
export const dynamic = "force-dynamic";

// Elle n'est PAS gardée, et c'est délibéré — exactement comme l'accueil de
// l'administration : elle sert à constater qu'une session ouverte sur la boutique vaut
// ici, ce que `e2e/session-sharing.spec.ts` vérifie sur les trois fronts. L'espace
// vendeur lui-même vit sous `/shop`, derrière la garde.
export default async function HomePage(): Promise<JSX.Element> {
    // Lecture côté serveur : le cookie posé sur le domaine parent arrive dans les
    // en-têtes de cette requête, alors même que l'utilisateur s'est connecté sur un
    // autre sous-domaine. C'est ce qui rend l'architecture à quatre applications
    // supportable pour l'utilisateur, qui ne se connecte qu'une fois.
    const session = await auth.api.getSession({ headers: await headers() });

    return (
        <main className="mx-auto max-w-3xl px-6 py-20">
            <h1 className="font-titre text-4xl tracking-tight">{messages.home.title}</h1>
            <p className="mt-4 text-base text-muet" data-testid="utilisateur">
                {session?.user.email ?? "anonyme"}
            </p>
            <Link
                href="/shop"
                className="mt-8 inline-block text-base underline underline-offset-4"
            >
                {messages.navigation.shop}
            </Link>
        </main>
    );
}
