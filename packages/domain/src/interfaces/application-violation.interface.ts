// Une violation est une clé et ses arguments, jamais une phrase : c'est l'appelant qui
// connaît la langue de celui qui la lira.
export interface IApplicationViolation {
    i18nKey: string;
    i18nArgs?: Record<string, unknown>;
}
