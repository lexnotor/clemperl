// L'environnement du paiement, lu une fois au démarrage et injecté sous `PAYMENTS_ENV`.
export interface IPaymentsEnv {
    payloadKey: Buffer;
    simulator: boolean;
    simulatorSecret: string;
    // Où le NAVIGATEUR joint l'API : l'URL de redirection vers la page du simulateur.
    apiPublicUrl: string;
    // Où l'acheteur revient après un paiement.
    storefrontUrl: string;
}
