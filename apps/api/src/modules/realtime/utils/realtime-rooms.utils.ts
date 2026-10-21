// Le nom d'une salle porte la partie qu'elle désigne : un compte et une boutique ne partagent
// jamais de salle, même si leurs identifiants venaient à coïncider.

// La salle d'un compte, rejointe depuis la boutique : ce qui concerne l'acheteur.
export function userRoom(userId: string): string {
    return `user:${userId}`;
}

// La salle d'une boutique, rejointe depuis l'espace vendeur par chacun de ses membres.
export function shopRoom(vendorId: string): string {
    return `shop:${vendorId}`;
}
