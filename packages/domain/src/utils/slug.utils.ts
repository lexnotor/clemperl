const MAX_SLUG_LENGTH = 60;

// Les accents sont dépliés et non encodés : `créations` et `creations` désigneraient
// sinon deux entités dont personne ne saurait dire laquelle il a visitée.
//
// Le noyau est neutre parce qu'il sert maintenant à deux entités — une boutique et un
// produit — et que la règle est la même. Deux copies divergeraient au premier ajustement.
export function slugify(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/^-+|-+$/g, "");
}
