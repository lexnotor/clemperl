export interface IPaymentStart {
    orderId: string;
    reference: string;
    amount: number;
    currency: string;
    returnUrl: string;
}

export interface IPaymentStarted {
    providerRef: string;
    redirectUrl: string;
}

export interface IPaymentEvent {
    providerRef: string;
    // `PENDING` est légitime : un fournisseur annonce souvent une étape avant l'issue.
    // Réduire l'événement à un booléen forcerait à lire « pas réglé » comme « échoué ».
    status: "PENDING" | "SETTLED" | "FAILED";
}

// La forme de `IEmailSender` : un port, des adapters, et un domaine qui ne connaît que le
// port.
export interface IPaymentAdapter {
    readonly provider: string;
    start(input: IPaymentStart): Promise<IPaymentStarted>;
    // Rend `null` sur signature fausse ou corps illisible, et ne LÈVE pas : une signature
    // fausse est un robot qui tape une URL publique, pas une panne à remonter. Lever
    // remplirait les journaux d'erreurs d'un bruit permanent qui finirait par masquer les
    // vraies.
    interpret(raw: string, headers: Readonly<Record<string, string>>): IPaymentEvent | null;
}
