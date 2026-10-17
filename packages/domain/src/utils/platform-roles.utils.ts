// Les décisions de rôle de plateforme vivent ici, et nulle part ailleurs. Les comparaisons
// à `"ADMIN"` écrites en dur dans le dépôt ont déjà produit plusieurs secondes vérités ;
// élargir chacune à la main rouvrirait ce problème à chaque ajout de niveau.
//
// Les paramètres sont des `string` et non `TPlatformRole` : la session arrive typée
// `string`, et une valeur hors vocabulaire tombe du côté du refus.

export type TPlatformRole = "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";

export function isAdministrator(role: string): boolean {
    return role === "ADMIN" || role === "SUPER_ADMIN";
}

// Nommer quelqu'un `CUSTOMER` n'est jamais une nomination : c'est un retrait, décidé par
// `canRemove`. Un administrateur nomme des administrateurs, un super_admin nomme aussi
// des super_admins.
export function canAppoint(actorRole: string, targetRole: string): boolean {
    if (targetRole === "CUSTOMER") {
        return false;
    }
    if (actorRole === "SUPER_ADMIN") {
        return true;
    }
    return actorRole === "ADMIN" && targetRole === "ADMIN";
}

// Retirer un super_admin réclame d'être super_admin. Retirer un administrateur est ouvert
// à tout administrateur. La garde du dernier super_admin n'est pas ici : elle dépend du
// nombre de lignes en base, que cette fonction ne connaît pas.
export function canRemove(actorRole: string, currentRole: string): boolean {
    if (currentRole === "SUPER_ADMIN") {
        return actorRole === "SUPER_ADMIN";
    }
    if (currentRole === "ADMIN") {
        return isAdministrator(actorRole);
    }
    return false;
}
