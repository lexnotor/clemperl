// Une erreur rendue au client porte une clé de traduction, jamais une phrase : une
// phrase fige la langue à l'endroit où l'erreur est levée, loin de celui qui la lira.
export interface II18nExceptionResponse {
    i18nKey: string;
    i18nArgs?: Record<string, unknown>;
    fallbackMessage?: string;
}
