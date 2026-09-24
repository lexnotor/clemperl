import { readMedia } from "@clemperl/core";
import { isServableMediaPath } from "@clemperl/domain";
import { NextResponse } from "next/server";

// Un an, et `immutable`. Les chemins ne changent JAMAIS — un `uuid` par dépôt, jamais
// réécrit — donc aucune invalidation n'est nécessaire. C'est ce qui fait que le relais
// coûte le premier accès et pas les suivants, et qu'un proxy placé devant le met en cache
// comme n'importe quelle réponse.
const CACHE = "public, max-age=31536000, immutable";

// Le motif n'autorise QUE des déclinaisons, produites par sharp en WebP : leur contenu et
// leur type sont les nôtres, jamais ceux du déposant. Ces deux en-têtes sont la seconde
// barrière, pour le jour où le motif s'élargirait.
//
// `nosniff` interdit au navigateur de se faire une opinion du type d'après les octets —
// c'est ainsi qu'un contenu bien choisi se fait exécuter sous un type inoffensif. La
// politique, elle, désarme ce qui serait tout de même interprété comme un document :
// cette origine porte le cookie de session partagé depuis T1a, et rien de ce que le
// relais sert n'a jamais besoin d'exécuter quoi que ce soit.
const SECURITY = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
} as const;

// CETTE route vit dans la boutique et nulle part ailleurs. L'espace vendeur y pointe
// plutôt que d'en porter une copie : la même règle écrite deux fois est exactement ce que
// ce dépôt passe son temps à éviter, et un motif relâché d'un seul côté suffirait.
//
// Elle ne vérifie NI le produit, NI son état de publication, NI la boutique. Les photos
// d'un brouillon sont donc lisibles par qui connaît leur chemin — c'est une décision,
// documentée en section 9 de la spec : le `uuid` de 36 caractères joue le rôle d'un lien
// non répertorié, et vérifier la publication coûterait une lecture en base par vignette,
// ce qui anéantirait la mise en cache qui justifie le relais.
//
// Elle ne sert en revanche JAMAIS l'original. Celui-ci revient du stockage tel qu'il a
// été déposé, avec le type que le navigateur du vendeur avait déclaré : un SVG portant un
// `script` — que sharp décline sans se plaindre, donc l'image passe `READY` et l'original
// survit — se serait exécuté ici, sur l'origine qui porte le cookie de session. Les
// déclinaisons sortent de sharp en WebP ; leur contenu est le nôtre.
export async function GET(
    _request: Request,
    context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
    const { path } = await context.params;
    const joined = path.join("/");

    // Le prédicat est ANCRÉ et vit dans le domaine, avec ses tests. Combiné au bucket
    // distinct, il fait deux barrières indépendantes : même relâché, il ne pourrait
    // atteindre aucun justificatif, qui vit dans un autre bucket.
    if (!isServableMediaPath(joined)) {
        return new NextResponse(null, { status: 404 });
    }

    try {
        const blob = await readMedia(joined);
        return new NextResponse(blob.stream(), {
            headers: {
                "Content-Type": blob.type || "application/octet-stream",
                "Cache-Control": CACHE,
                ...SECURITY,
            },
        });
    } catch {
        // Un objet absent est un 404, pas un 500 : le chemin est bien formé, c'est le
        // contenu qui n'existe pas — et le distinguer n'apprendrait rien d'utile à qui
        // demande, sinon que le chemin était plausible.
        return new NextResponse(null, { status: 404 });
    }
}
