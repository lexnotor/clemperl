// L'écran qui accueille la pièce du propriétaire. Il écrit deux choses : `PRODUCTS_QUERY`, dans
// `products.query.ts`, la demande faite à l'API ; et `ProductRow`, dans `product-row.tsx`, la
// ligne d'un produit. L'écran, lui, les branche : il passe la réponse à `QueryGate` et rend
// une ligne par produit.
import { useQuery } from "@apollo/client/react";
import type { JSX } from "react";
import { Text } from "react-native";
import { useT } from "../../i18n/use-t";
import { QueryGate } from "../../ui/query-gate";
import { useTheme } from "../../ui/use-theme";
import { ProductRow } from "./product-row";
import { PRODUCTS_QUERY } from "./products.query";

export function ProductsScreen(): JSX.Element {
    const t = useT();
    const theme = useTheme();
    // `notifyOnNetworkStatusChange` : sans lui, « Réessayer » relance la requête sans que
    // l'écran repasse par l'attente.
    const result = useQuery(PRODUCTS_QUERY, { notifyOnNetworkStatusChange: true });

    return (
        <QueryGate result={result}>
            {({ products }) =>
                products.length === 0 ? (
                    <Text style={{ color: theme.muted }}>{t("products.empty")}</Text>
                ) : (
                    products.map((product) => (
                        <ProductRow
                            key={product.id}
                            title={product.title}
                            status={product.status}
                        />
                    ))
                )
            }
        </QueryGate>
    );
}
