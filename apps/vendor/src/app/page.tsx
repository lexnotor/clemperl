import { auth } from "@clemperl/auth";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { headers } from "next/headers";
import type { JSX } from "react";

// Cette page lit la session : elle ne peut pas être pré-rendue au build. Sans
// `force-dynamic`, Next sert un rendu figé, et un utilisateur qui vient de se
// déconnecter continue d'y voir son adresse.
export const dynamic = "force-dynamic";

export default async function AccueilPage(): Promise<JSX.Element> {
    // Lecture côté serveur : le cookie posé sur le domaine parent arrive dans les
    // en-têtes de cette requête, alors même que l'utilisateur s'est connecté sur un
    // autre sous-domaine. C'est ce qui rend l'architecture à quatre applications
    // supportable pour l'utilisateur, qui ne se connecte qu'une fois.
    const session = await auth.api.getSession({ headers: await headers() });

    return (
        <main className="mx-auto max-w-3xl px-4 py-16">
            <h1 className="text-3xl font-semibold">{messages.home.title}</h1>
            <p className="mt-4" data-testid="utilisateur">
                {session?.user.email ?? "anonyme"}
            </p>
        </main>
    );
}
