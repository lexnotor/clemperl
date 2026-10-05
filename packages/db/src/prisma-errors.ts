// `P2002` est le code que Prisma pose sur une violation de contrainte d'unicité. Le
// distinguer permet de dire au vendeur de changer sa saisie plutôt que de lui montrer une
// panne, et de lui éviter de reproduire exactement le même refus.
//
// Écrit ICI parce que trois dépôts en avaient besoin : les deux premiers en portaient
// chacun une copie privée, et la troisième aurait été celle de trop. Lire le CODE et non
// le message protège d'une reformulation de Prisma, qui n'est pas un contrat.
export function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: unknown }).code === "P2002"
    );
}
