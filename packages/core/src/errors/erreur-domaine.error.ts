import type { II18nExceptionResponse } from "../interfaces/index.js";

// Les règles métier lèvent cette erreur, jamais une exception de framework : importer
// `@nestjs/common` depuis un package que consomme aussi un composant Next ferait entrer
// Nest dans le paquet envoyé au navigateur.
export class ErreurDomaine extends Error implements II18nExceptionResponse {
    readonly i18nKey: string;
    readonly i18nArgs?: Record<string, unknown>;
    readonly fallbackMessage?: string;

    constructor(reponse: II18nExceptionResponse) {
        // Le message natif sert aux journaux, qui ne passent par aucune traduction.
        super(reponse.fallbackMessage ?? reponse.i18nKey);
        this.name = new.target.name;
        this.i18nKey = reponse.i18nKey;
        this.i18nArgs = reponse.i18nArgs;
        this.fallbackMessage = reponse.fallbackMessage;
    }
}
