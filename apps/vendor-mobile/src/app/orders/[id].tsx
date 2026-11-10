import { Stack, useLocalSearchParams } from "expo-router";
import type { JSX } from "react";
import { OrderScreen } from "../../features/orders/order-screen";
import { useT } from "../../i18n/use-t";
import { Screen } from "../../ui/screen";
import { useHeaderOptions } from "../../ui/use-header-options";

// Le détail d'une commande, ouvert depuis la liste par `router.push`. Le segment `[id]` du nom
// de fichier devient le paramètre que `useLocalSearchParams` lit.
export default function Order(): JSX.Element {
    const t = useT();
    const { id } = useLocalSearchParams<{ id: string }>();
    const options = useHeaderOptions(t("orders.title"));

    return (
        <>
            <Stack.Screen options={options} />
            <Screen underHeader>
                <OrderScreen id={id} />
            </Screen>
        </>
    );
}
