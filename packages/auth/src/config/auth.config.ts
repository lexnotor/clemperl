import { creerSmtpSender } from "@clemperl/core";
import { prisma } from "@clemperl/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
    construireMessageReinitialisation,
    construireMessageVerification,
} from "../utils/index.js";

// Configuration unique de l'authentification, partagée par les quatre applications.
// Les trois fronts Next montent le gestionnaire qu'elle expose ; l'API NestJS lit les
// sessions qu'elle produit. Une seule configuration signifie qu'aucune divergence de
// secret, de durée ou de domaine de cookie ne peut s'installer entre les applications.

// En production, les applications vivent sur de vrais sous-domaines et le cookie doit
// porter le domaine parent, sans quoi chaque front reconnaîtrait l'utilisateur pour lui
// seul. En développement, elles vivent sur `localhost` à des ports différents : les
// cookies n'étant PAS isolés par port, le partage y est acquis sans aucun réglage, et
// forcer un domaine ferait au contraire rejeter le cookie.
//
// C'est le seul écart de configuration entre les deux environnements, et il ne se
// vérifie qu'au premier déploiement.
const domaineCookie = process.env["COOKIE_DOMAIN"];

// Le fournisseur n'est déclaré QUE si ses identifiants existent. Le déclarer à vide
// ferait échouer le parcours au clic, avec une erreur venue de Google : impossible à
// relier à une variable manquante chez nous. Sans identifiants, le bouton n'apparaît
// simplement pas, et le parcours par mot de passe reste entier.
const identifiantsGoogle = {
    clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
    clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
};

const fournisseursSociaux =
    identifiantsGoogle.clientId && identifiantsGoogle.clientSecret
        ? { google: identifiantsGoogle }
        : {};

export const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: process.env["BETTER_AUTH_SECRET"],

    // Sans `baseURL`, Better Auth déduit l'adresse des liens de courriels de l'hôte
    // d'écoute du processus : en conteneur, `0.0.0.0:3000`, qui ne mène nulle part.
    // Le courriel part correctement et son lien est inutilisable — un défaut qui ne se
    // voit qu'en ouvrant le message reçu.
    //
    // La boutique sert de base pour tous les liens : c'est l'entrée publique, et un
    // lien de vérification reçu par un vendeur y fonctionne aussi bien, la session
    // valant ensuite sur les trois sous-domaines.
    baseURL: process.env["NEXT_PUBLIC_STOREFRONT_URL"],

    // Les trois fronts montent le gestionnaire : chacun doit être reconnu comme une
    // origine légitime, sinon les requêtes venues des deux autres sont rejetées.
    trustedOrigins: [
        process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "",
        process.env["NEXT_PUBLIC_VENDOR_URL"] ?? "",
        process.env["NEXT_PUBLIC_ADMIN_URL"] ?? "",
    ],

    emailAndPassword: {
        enabled: true,
        // La vérification est exigée de tout le monde : une boutique engage des
        // échanges d'argent, et l'administration doit pouvoir joindre son responsable.
        requireEmailVerification: true,

        sendResetPassword: async ({ user, url }): Promise<void> => {
            const message = construireMessageReinitialisation(url, "fr");
            await creerSmtpSender(
                process.env["SMTP_URL"] ?? "",
                process.env["EMAIL_FROM"] ?? "",
            ).envoyer({ ...message, destinataire: user.email });
        },
    },

    emailVerification: {
        // Le courriel part dès l'inscription : sans vérification le compte ne peut rien
        // faire, donc attendre une action de l'utilisateur pour l'envoyer le laisserait
        // bloqué sans comprendre pourquoi.
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }): Promise<void> => {
            const message = construireMessageVerification(url, "fr");
            await creerSmtpSender(
                process.env["SMTP_URL"] ?? "",
                process.env["EMAIL_FROM"] ?? "",
            ).envoyer({ ...message, destinataire: user.email });
        },
    },

    socialProviders: fournisseursSociaux,

    advanced: {
        crossSubDomainCookies: domaineCookie
            ? { enabled: true, domain: domaineCookie }
            : { enabled: false },
    },
});
