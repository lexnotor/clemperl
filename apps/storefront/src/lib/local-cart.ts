import { boundQuantity } from "@clemperl/domain/browser";

export const LOCAL_CART_KEY = "cart";

export interface ILocalLine {
    variantId: string;
    quantity: number;
    /** La devise de la boutique de cet article, pour refuser un mélange avant la connexion. */
    currency: string;
}

// Le panier d'un visiteur vit ICI et nulle part ailleurs : le serveur n'en sait rien tant
// qu'il n'y a pas de compte. Il ne range que des identifiants et des quantités, JAMAIS de
// prix : rangés, ils seraient périmés dès le lendemain, et l'acheteur commanderait au prix
// d'avant.
//
// Toute lecture est enveloppée : `localStorage` lève en navigation privée, et un panier
// illisible doit se comporter comme un panier vide, pas casser la page.
export function readLocalCart(): ILocalLine[] {
    try {
        const raw = window.localStorage.getItem(LOCAL_CART_KEY);
        if (!raw) {
            return [];
        }
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((line: Record<string, unknown>) => ({
                variantId: String(line["variantId"] ?? ""),
                quantity: boundQuantity(line["quantity"]),
                currency: String(line["currency"] ?? ""),
            }))
            .filter((line) => line.variantId !== "" && line.quantity > 0);
    } catch {
        return [];
    }
}

function write(lines: ILocalLine[]): void {
    try {
        window.localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(lines));
    } catch {
        // Stockage refusé : le panier ne survivra pas au rechargement, et c'est tout ce
        // qu'on peut faire sans compte.
    }
}

// Le refus de devise arrive DÈS L'AJOUT, et non à la connexion : un acheteur qui découvre
// à la connexion que la moitié de son panier est écartée ne comprendra pas pourquoi.
export function addToLocalCart(line: ILocalLine): { added: boolean; reason?: "currency" } {
    const current = readLocalCart();
    const currency = current[0]?.currency;
    if (currency !== undefined && currency !== line.currency) {
        return { added: false, reason: "currency" };
    }

    const existing = current.find((l) => l.variantId === line.variantId);
    if (existing) {
        existing.quantity = boundQuantity(existing.quantity + line.quantity);
    } else {
        current.push({ ...line, quantity: boundQuantity(line.quantity) });
    }
    write(current);
    return { added: true };
}

export function clearLocalCart(): void {
    try {
        window.localStorage.removeItem(LOCAL_CART_KEY);
    } catch {
        // Rien à faire : la remontée a déjà réussi côté serveur.
    }
}
