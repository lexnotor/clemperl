import { slugify } from "./slug.utils.js";

// Le slug d'une boutique est figé à la validation : il part dans les URL publiques, et
// une URL qui bouge est une URL cassée.
export function slugifyShopName(name: string): string {
    return slugify(name);
}
