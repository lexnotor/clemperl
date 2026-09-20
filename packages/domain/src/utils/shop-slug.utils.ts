const MAX_SLUG_LENGTH = 60;

// Les accents sont dépliés et non encodés : `créations` et `creations` désigneraient
// sinon deux boutiques dont personne ne saurait dire laquelle il a visitée.
export function slugifyShopName(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, MAX_SLUG_LENGTH)
        .replace(/^-+|-+$/g, "");
}
