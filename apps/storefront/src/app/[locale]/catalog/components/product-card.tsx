import { derivativePath } from "@clemperl/domain/browser";
import Link from "next/link";
import type { JSX } from "react";

interface ProductCardProps {
    shopSlug: string;
    productSlug: string;
    title: string;
    shopName: string;
    imagePath: string;
    /** Déjà formaté par le serveur. Aucun prix ne se formate côté client. */
    price: string;
}

// Composant SERVEUR. Un `img` ordinaire et non `next/image` : la vignette est servie par la
// route de relais de cette même application, avec un cache d'un an et un chemin immuable.
// L'optimiseur n'y gagnerait rien et demanderait d'autoriser l'origine.
export function ProductCard(props: ProductCardProps): JSX.Element {
    return (
        <Link
            href={`/shops/${props.shopSlug}/${props.productSlug}`}
            className="flex flex-col border border-bordure"
        >
            <img
                data-testid="vignette"
                src={`/api/media/${derivativePath(props.imagePath, 320)}`}
                alt=""
                className="aspect-square w-full object-cover"
            />
            <span className="px-4 pt-4 text-sm">{props.title}</span>
            <span className="px-4 text-xs text-muet">{props.shopName}</span>
            <span className="px-4 pb-4 pt-2 text-sm">{props.price}</span>
        </Link>
    );
}
