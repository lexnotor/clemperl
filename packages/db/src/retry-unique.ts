import { isUniqueViolation } from "./prisma-errors.js";

export const ERROR_UNIQUE_RETRY_EXHAUSTED = "UNIQUE_RETRY_EXHAUSTED";

/** Quatre essais : trois collisions de suite tiennent de l'impossible, pas du rare. */
const ESSAIS_PAR_DEFAUT = 4;

// Rejoue une écriture qui a buté sur une contrainte d'unicité, quand la valeur en conflit
// est TIRÉE AU SORT et qu'un nouveau tirage lève le conflit.
//
// C'est le cas des références de commande : six caractères sur un alphabet de 32 donnent un
// milliard de tirages, ce qui semble énorme et ne l'est pas. Le paradoxe des anniversaires
// donne environ 5 % de chance de collision dès 10 000 commandes par an, et 70 % à 50 000.
// Sans reprise, cette collision ne dégrade rien : elle fait échouer toute la validation, et
// l'acheteur reçoit une page d'erreur au lieu de sa commande.
//
// La tentative est rejouée ENTIÈREMENT, et non la seule insertion : PostgreSQL refuse toute
// instruction qui suit une erreur dans la même transaction, donc réessayer à l'intérieur ne
// marcherait pas. Rejouer la transaction regénère les références au passage, ce qui est
// précisément ce qu'on veut.
//
// Une erreur qui n'est PAS une violation d'unicité remonte immédiatement : rejouer une panne
// la multiplierait et masquerait sa cause.
export async function retryOnUniqueViolation<T>(
    attempt: () => Promise<T>,
    tries: number = ESSAIS_PAR_DEFAUT,
): Promise<T> {
    for (let essai = 0; essai < tries; essai += 1) {
        try {
            return await attempt();
        } catch (error) {
            if (!isUniqueViolation(error)) {
                throw error;
            }
        }
    }

    // Nommé plutôt que de laisser passer le dernier `P2002`. Épuiser les essais ne dit pas
    // « collision », cela dit « le hasard a été extraordinaire, ou ce n'est pas la
    // contrainte qu'on croit », et l'appelant doit pouvoir faire la différence.
    throw new Error(ERROR_UNIQUE_RETRY_EXHAUSTED);
}
