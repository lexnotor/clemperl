import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ces messages sont construits
// hors de tout contexte de requête Next, où `getTranslations` n'existe pas.
//
// Le LIBELLÉ DU MOTIF est ici aussi. Le vendeur et l'acheteur ont chacun leur langue, et le
// catalogue de l'administration n'existe qu'en français : y prendre le libellé ferait
// partir un message anglais portant un motif français.
//
// Chaque texte dit ce qui va se passer, et surtout ce qui ne se passera pas : la plateforme
// ne détient jamais les fonds, donc elle ne rembourse ni ne prélève rien.
const TEXTS = {
    fr: {
        reason: {
            DAMAGED: "Article arrivé abîmé",
            WRONG_ITEM: "Ce n'est pas l'article commandé",
            NOT_RECEIVED: "Colis jamais reçu",
        } as Record<string, string>,
        opened: (reference: string, reason: string, link: string) => ({
            subject: `Votre client conteste la commande ${reference}`,
            text: `Un client conteste la commande ${reference}.\n\nMotif :\n${reason}\n\nSon récit et ses éventuelles preuves vous attendent sur la commande. Répondez-lui depuis votre espace vendeur :\n${link}\n\nSans nouvel échange pendant sept jours, l'administration tranchera sur les pièces déposées.`,
        }),
        decision: {
            DECIDED_FOR_BUYER: {
                BUYER: (reference: string) => ({
                    subject: `Votre litige sur la commande ${reference} : décision en votre faveur`,
                    intro: `L'administration vous donne raison sur la commande ${reference}. Le vendeur est tenu de vous servir correctement, à sa façon : renvoi, remplacement ou remboursement.\n\nLa plateforme ne rembourse rien elle-même, elle ne détient pas les fonds. Quand vous aurez été servi, dites-le depuis la page du litige.`,
                }),
                VENDOR: (reference: string) => ({
                    subject: `Litige sur la commande ${reference} : décision en faveur du client`,
                    intro: `L'administration donne raison à votre client sur la commande ${reference}. Vous devez le servir correctement, comme vous l'entendez : renvoi, remplacement ou remboursement par votre propre canal d'encaissement.\n\nLa plateforme ne prélève rien sur votre compte.`,
                }),
            },
            DECIDED_FOR_VENDOR: {
                BUYER: (reference: string) => ({
                    subject: `Votre litige sur la commande ${reference} est clos`,
                    intro: `L'administration n'a pas retenu votre réclamation sur la commande ${reference}. Le litige est clos, sans suite.`,
                }),
                VENDOR: (reference: string) => ({
                    subject: `Litige sur la commande ${reference} : clos en votre faveur`,
                    intro: `L'administration vous donne raison sur la commande ${reference}. Le litige est clos, sans suite, et vous n'avez rien à faire.`,
                }),
            },
        },
        comment: "Le mot de l'administration :" as string,
        link: "Le litige :" as string,
    },
    en: {
        reason: {
            DAMAGED: "Item arrived damaged",
            WRONG_ITEM: "Wrong item received",
            NOT_RECEIVED: "Parcel never received",
        } as Record<string, string>,
        opened: (reference: string, reason: string, link: string) => ({
            subject: `Your customer is disputing order ${reference}`,
            text: `A customer is disputing order ${reference}.\n\nReason:\n${reason}\n\nTheir account and any proof are waiting on the order. Reply from your vendor area:\n${link}\n\nIf nothing new is said for seven days, the administration will decide on the evidence provided.`,
        }),
        decision: {
            DECIDED_FOR_BUYER: {
                BUYER: (reference: string) => ({
                    subject: `Your dispute on order ${reference}: decided in your favour`,
                    intro: `The administration has decided in your favour on order ${reference}. The vendor must serve you properly, in their own way: resending, replacing or refunding.\n\nThe platform does not refund anything itself, as it never holds the funds. Once you have been served, say so from the dispute page.`,
                }),
                VENDOR: (reference: string) => ({
                    subject: `Dispute on order ${reference}: decided in the customer's favour`,
                    intro: `The administration has decided in your customer's favour on order ${reference}. You must serve them properly, as you see fit: resending, replacing or refunding through your own payment channel.\n\nThe platform takes nothing from your account.`,
                }),
            },
            DECIDED_FOR_VENDOR: {
                BUYER: (reference: string) => ({
                    subject: `Your dispute on order ${reference} is closed`,
                    intro: `The administration has not upheld your claim on order ${reference}. The dispute is closed, with no further action.`,
                }),
                VENDOR: (reference: string) => ({
                    subject: `Dispute on order ${reference}: closed in your favour`,
                    intro: `The administration has decided in your favour on order ${reference}. The dispute is closed, with no further action, and there is nothing for you to do.`,
                }),
            },
        },
        comment: "A word from the administration:" as string,
        link: "The dispute:" as string,
    },
} as const;

function texts(locale: string): (typeof TEXTS)["fr"] {
    return locale === "en" ? TEXTS.en : TEXTS.fr;
}

// Un motif hors vocabulaire retombe sur son code brut plutôt que sur un message vide : le
// dépôt le refuse en amont, mais ce constructeur est pur et ne compte pas sur son appelant.
export function buildDisputeOpenedMessage(
    input: { reference: string; reason: string; link: string },
    locale: string,
): IEmailMessage {
    const langue = texts(locale);
    const motif = langue.reason[input.reason] ?? input.reason;
    return { recipient: "", ...langue.opened(input.reference, motif, input.link) };
}

// Le commentaire part tel que l'administrateur l'a écrit, dans sa langue à lui : c'est une
// saisie libre, et le traduire n'est pas l'affaire de ce constructeur.
export function buildDisputeDecisionMessage(
    input: {
        reference: string;
        outcome: "DECIDED_FOR_BUYER" | "DECIDED_FOR_VENDOR";
        party: "BUYER" | "VENDOR";
        comment: string;
        link: string;
    },
    locale: string,
): IEmailMessage {
    const langue = texts(locale);
    const { subject, intro } = langue.decision[input.outcome][input.party](input.reference);
    return {
        recipient: "",
        subject,
        text: `${intro}\n\n${langue.comment}\n${input.comment}\n\n${langue.link}\n${input.link}`,
    };
}
