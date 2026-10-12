// Jetons d'injection. Nest construit lui-même ce qui consomme un jeton, ce qu'une instance
// passée par `useValue` sur la classe consommatrice ne permettrait pas.
export const PAYMENTS_ENV = Symbol("CLEMPERL_PAYMENTS_ENV");
export const PAYMENT_REGISTRY = Symbol("CLEMPERL_PAYMENT_REGISTRY");

// Les CODES que l'API rend au client. Aucune phrase ne sort de l'API : la traduction vit
// dans les catalogues du front, qui choisit son message d'après le code.
export const ERROR_NO_ADAPTER = "PAYMENT_NO_ADAPTER";
export const ERROR_NOT_A_MEMBER = "PAYMENT_NOT_A_MEMBER";
export const ERROR_ORIGIN_REFUSED = "PAYMENT_ORIGIN_REFUSED";
export const ERROR_PROVIDER_UNKNOWN = "PAYMENT_PROVIDER_UNKNOWN";
export const ERROR_SIGNATURE_REFUSED = "PAYMENT_SIGNATURE_REFUSED";
export const ERROR_SIMULATOR_DISABLED = "PAYMENT_SIMULATOR_DISABLED";
export const ERROR_SIMULATOR_INPUT_INVALID = "PAYMENT_SIMULATOR_INPUT_INVALID";
export const ERROR_RETURN_URL_REFUSED = "PAYMENT_RETURN_URL_REFUSED";
export const ERROR_WEBHOOK_REFUSED = "PAYMENT_WEBHOOK_REFUSED";
