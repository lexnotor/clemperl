const LONGUEUR_MAX_SLUG = 60;

// Les accents sont dépliés et non encodés : `créations` et `creations` désigneraient
// sinon deux boutiques dont personne ne saurait dire laquelle il a visitée.
export function slugifierNomBoutique(nom: string): string {
    return nom
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, LONGUEUR_MAX_SLUG)
        .replace(/^-+|-+$/g, "");
}
