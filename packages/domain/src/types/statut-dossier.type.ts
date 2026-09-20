import type { E_VENDOR_APPLICATION_STATUS } from "@clemperl/db/enums";

// Dérivé de l'énumération générée plutôt que réécrit : une valeur ajoutée au schéma se
// propage ici, et une valeur retirée casse la compilation là où elle est encore attendue.
export type TStatutDossier =
    (typeof E_VENDOR_APPLICATION_STATUS)[keyof typeof E_VENDOR_APPLICATION_STATUS];
