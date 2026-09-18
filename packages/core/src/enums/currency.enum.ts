// Devises acceptées par la plateforme, en codes ISO 4217.
export const E_CURRENCY = {
    EUR: "EUR",
    USD: "USD",
    XOF: "XOF",
    XAF: "XAF",
    CDF: "CDF",
} as const;

export type TCurrency = (typeof E_CURRENCY)[keyof typeof E_CURRENCY];
