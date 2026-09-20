import { auth } from "@clemperl/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// La garde vit dans le composant serveur et non dans le middleware : celui-ci ne pourrait
// faire qu'une lecture optimiste du cookie, et poser la règle aux deux endroits créerait
// deux vérités à tenir synchrones.
export async function requireVerifiedSession(destination: string) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        redirect(`/sign-in?next=${encodeURIComponent(destination)}`);
    }

    if (!session.user.emailVerified) {
        redirect("/verify-email");
    }

    return session;
}
