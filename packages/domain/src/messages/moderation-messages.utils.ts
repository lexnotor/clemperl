import type { IEmailMessage } from "@clemperl/core";

// Les textes vivent ici et non dans les catalogues next-intl : ces messages sont construits
// hors de tout contexte de requête Next, où `getTranslations` n'existe pas.
//
// Le message dit ce qui est arrivé et ce que le vendeur peut faire. Il ne menace pas : le
// retrait est un avertissement, et republier reste possible.
//
// Le LIBELLÉ DU MOTIF est ici aussi, et pas seulement dans le catalogue de l'administration.
// Celui-ci n'existe qu'en français, parce que l'administration travaille en français ; le
// vendeur, lui, a sa propre langue. Prendre le libellé là-bas ferait partir un message
// anglais portant un motif français, c'est-à-dire mettre la seule information actionnable
// dans la langue qu'on vient de déterminer qu'il ne lit pas.
const TEXTS = {
    fr: {
        reason: {
            COUNTERFEIT: "Contrefaçon",
            PROHIBITED_ITEM: "Article interdit à la vente",
            MISLEADING_CONTENT: "Description ou photo trompeuse",
            INAPPROPRIATE_IMAGE: "Image inappropriée",
        } as Record<string, string>,
        retirement: (title: string, reason: string) => ({
            subject: `« ${title} » a été retiré du catalogue`,
            text: `Votre article « ${title} » a été retiré du catalogue et repassé en brouillon.\n\nMotif :\n${reason}\n\nVous le retrouvez dans votre espace vendeur. Vous pouvez le corriger et le publier à nouveau.`,
        }),
    },
    en: {
        reason: {
            COUNTERFEIT: "Counterfeit",
            PROHIBITED_ITEM: "Item not allowed for sale",
            MISLEADING_CONTENT: "Misleading description or photo",
            INAPPROPRIATE_IMAGE: "Inappropriate image",
        } as Record<string, string>,
        retirement: (title: string, reason: string) => ({
            subject: `"${title}" has been pulled from the catalogue`,
            text: `Your item "${title}" has been pulled from the catalogue and moved back to draft.\n\nReason:\n${reason}\n\nYou will find it in your vendor area. You can correct it and publish it again.`,
        }),
    },
} as const;

function texts(locale: string): (typeof TEXTS)["fr"] {
    return locale === "en" ? TEXTS.en : TEXTS.fr;
}

// Le motif arrive par son CODE, pas par un libellé déjà rendu : c'est ce qui permet de le
// traduire ici. Les précisions, elles, sont une saisie libre de l'administrateur et partent
// telles quelles, dans sa langue à lui, ce qui est assumé.
//
// `OTHER` n'a pas de libellé : il ne dit rien par lui-même, et seules les précisions
// parlent. Un motif hors vocabulaire retombe sur son code brut plutôt que de produire un
// message vide : le dépôt le refuse en amont, mais ce constructeur est pur et ne compte pas
// sur son appelant.
export function buildRetirementMessage(
    title: string,
    reasonCode: string,
    details: string,
    locale: string,
): IEmailMessage {
    const langue = texts(locale);
    const precisions = details.trim();
    const libelle = langue.reason[reasonCode];

    const motif =
        libelle === undefined
            ? precisions === ""
                ? reasonCode
                : precisions
            : precisions === ""
              ? libelle
              : `${libelle}\n\n${precisions}`;

    return { recipient: "", ...langue.retirement(title, motif) };
}
