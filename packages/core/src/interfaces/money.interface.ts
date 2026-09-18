import type { TCurrency } from "../enums/index.js";

// Un montant est TOUJOURS un entier dans l'unité mineure de sa devise (centimes
// pour l'euro, francs pour le XOF), accompagné de cette devise. Un nombre à
// virgule flottante ne peut pas représenter un prix sans erreur d'arrondi
// cumulative.
export interface IMoney {
    amount: number;
    currency: TCurrency;
}
