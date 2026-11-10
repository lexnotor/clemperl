import { Stack } from "expo-router";
import type { JSX } from "react";
import { ProductsScreen } from "../features/products/products-screen";
import { useT } from "../i18n/use-t";
import { Screen } from "../ui/screen";
import { useHeaderOptions } from "../ui/use-header-options";

// La liste des produits, sous l'en-tête natif d'Expo Router et son retour.
export default function Products(): JSX.Element {
    const t = useT();
    const options = useHeaderOptions(t("products.title"));

    return (
        <>
            <Stack.Screen options={options} />
            <Screen underHeader>
                <ProductsScreen />
            </Screen>
        </>
    );
}
