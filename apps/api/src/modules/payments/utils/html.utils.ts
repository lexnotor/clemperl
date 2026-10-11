const ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
} as const;

// Tout ce qui vient de l'URL et se retrouve dans la page passe par ici : la page du
// simulateur est servie par l'API, sur une origine qui porte la session, et un paramètre
// rendu tel quel y exécuterait le script de quiconque fabrique le lien.
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/gu, (character) => ESCAPES[character as keyof typeof ESCAPES]);
}
