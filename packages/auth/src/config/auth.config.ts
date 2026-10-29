import { createSmtpSender } from "@clemperl/core";
import { isPendingAdministratorInvitation, prisma } from "@clemperl/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { mobileOriginPlugin } from "../plugins/index.js";
import {
    RESET_PASSWORD_TOKEN_EXPIRES_IN,
    buildAdministratorInvitationMessage,
    buildPasswordResetMessage,
    buildVerificationMessage,
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
    // Le courriel part correctement et son lien est inutilisable : un défaut qui ne se
    // voit qu'en ouvrant le message reçu.
    //
    // La boutique sert de base pour tous les liens : c'est l'entrée publique, et un
    // lien de vérification reçu par un vendeur y fonctionne aussi bien, la session
    // valant ensuite sur les trois sous-domaines.
    baseURL: process.env["NEXT_PUBLIC_STOREFRONT_URL"],

    // Les trois fronts montent le gestionnaire : chacun doit être reconnu comme une
    // origine légitime, sinon les requêtes venues des deux autres sont rejetées.
    //
    // S'y ajoute le schéma d'adresse de l'application vendeur, `clemperl-vendor://`, que
    // `app.json` déclare et qu'un test de l'application tient d'accord. `mobileOriginPlugin`
    // fait confiance de lui-même à `exp://` en développement, l'origine d'Expo Go ; le schéma
    // sert à toute version construite de l'application.
    trustedOrigins: [
        process.env["NEXT_PUBLIC_STOREFRONT_URL"] ?? "",
        process.env["NEXT_PUBLIC_VENDOR_URL"] ?? "",
        process.env["NEXT_PUBLIC_ADMIN_URL"] ?? "",
        "clemperl-vendor://",
    ],

    // Le téléphone n'envoie pas d'`Origin` : son client annonce la sienne dans `expo-origin`,
    // que ce plugin recopie en `Origin` avant le contrôle des origines de confiance. Sans lui,
    // l'en-tête n'est lu par personne, et une connexion sans origine passe sans contrôle.
    // Pourquoi un plugin à nous et non `expo()` de `@better-auth/expo` : voir son fichier.
    plugins: [mobileOriginPlugin()],

    emailAndPassword: {
        enabled: true,
        // La vérification est exigée de tout le monde : une boutique engage des
        // échanges d'argent, et l'administration doit pouvoir joindre son responsable.
        requireEmailVerification: true,

        // Durée GLOBALE : elle allonge aussi tous les liens d'oubli de mot de passe des
        // clients, pas seulement ceux des invitations. Better Auth n'offre pas de durée
        // par parcours ; le risque est accepté, le lien étant à usage unique et ne
        // donnant rien sans l'accès à la boîte courriel.
        resetPasswordTokenExpiresIn: RESET_PASSWORD_TOKEN_EXPIRES_IN,

        sendResetPassword: async ({ user, url }): Promise<void> => {
            // Une invitation passe par la même route qu'un oubli de mot de passe, donc
            // c'est ici que les deux textes se départagent. La condition est lue en base
            // plutôt que sur l'objet `user` : le rôle n'arrive ici que par les champs
            // additionnels de la bibliothèque, et le jour où il cesserait d'être peuplé,
            // un repli silencieux priverait tous les invités de leur accueil. Si la
            // lecture échoue, l'erreur remonte et aucun courriel ne part : mieux vaut un
            // échec visible qu'un message qui ne correspond pas à la situation.
            const invitation = await isPendingAdministratorInvitation(prisma, user.id);
            const message = invitation
                ? buildAdministratorInvitationMessage(url, "fr")
                : buildPasswordResetMessage(url, "fr");
            await createSmtpSender(
                process.env["SMTP_URL"] ?? "",
                process.env["EMAIL_FROM"] ?? "",
            ).send({ ...message, recipient: user.email });
        },
    },

    emailVerification: {
        // Le courriel part dès l'inscription : sans vérification le compte ne peut rien
        // faire, donc attendre une action de l'utilisateur pour l'envoyer le laisserait
        // bloqué sans comprendre pourquoi.
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }): Promise<void> => {
            const message = buildVerificationMessage(url, "fr");
            await createSmtpSender(
                process.env["SMTP_URL"] ?? "",
                process.env["EMAIL_FROM"] ?? "",
            ).send({ ...message, recipient: user.email });
        },
    },

    // Le rôle vit sur le compte et doit voyager dans la session : sans lui, chaque garde
    // devrait interroger la base à chaque rendu.
    //
    // `input: false` n'est pas une précaution de style : sans lui, le rôle fait partie
    // du corps accepté à l'inscription, et n'importe qui s'inscrit en se déclarant
    // administrateur.
    user: {
        additionalFields: {
            role: { type: "string", input: false, defaultValue: "CUSTOMER" },
        },
    },

    socialProviders: fournisseursSociaux,

    advanced: {
        crossSubDomainCookies: domaineCookie
            ? { enabled: true, domain: domaineCookie }
            : { enabled: false },
    },
});
