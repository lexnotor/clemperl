// L'ordre d'une collection est une donnée du vendeur, pas un tri. Cette fonction dit ce
// que devient la liste, et le dépôt réécrit les positions : séparer les deux permet de
// tester la règle sans base.
export function moveItem<T extends { id: string }>(
    items: readonly T[],
    id: string,
    direction: "up" | "down",
): T[] {
    const from = items.findIndex((item) => item.id === id);
    const to = direction === "up" ? from - 1 : from + 1;

    // Un identifiant inconnu, ou un mouvement hors des bornes, rend la liste telle quelle.
    // Le bouton reste cliquable en tête et en queue, et un clic sans effet n'est pas une
    // erreur à remonter à l'utilisateur.
    if (from === -1 || to < 0 || to >= items.length) {
        return [...items];
    }

    const moved = [...items];
    const [item] = moved.splice(from, 1);
    moved.splice(to, 0, item as T);
    return moved;
}
