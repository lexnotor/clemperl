// L'avertissement ne vaut que s'il y a quelque chose à avertir : une annulation possible ET
// un paiement déjà reçu. Le dire sur une commande impayée inquiéterait pour rien, et le
// taire sur une commande payée laisserait annuler sans savoir qu'aucun remboursement ne suit.
export function shouldWarnSettled(paymentStatus: string, allowed: readonly string[]): boolean {
    return paymentStatus === "SETTLED" && allowed.includes("CANCEL");
}
