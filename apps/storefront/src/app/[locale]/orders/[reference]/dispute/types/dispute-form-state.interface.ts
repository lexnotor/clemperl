// Un seul format de sortie, qu'il y ait une ou dix fautes. Les clés sont traduites par la
// server action, jamais par le composant.
//
// Hors du module `"use server"` : celui-ci n'exporte que des fonctions asynchrones, et une
// constante qu'on y mettrait arriverait `undefined` au composant client.
export interface IDisputeFormState {
    message: string[];
    /** Ce que la personne avait saisi, rendu sur un refus : React vide le formulaire dès que
     * son action se termine, refus compris, et le formulaire le réaffiche. */
    values?: {
        body: string;
        reason?: string;
        lineIds?: string[];
    };
}

export const INITIAL_DISPUTE_FORM_STATE: IDisputeFormState = { message: [] };
