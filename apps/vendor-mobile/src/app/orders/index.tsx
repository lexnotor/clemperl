import { Stack } from "expo-router";
import type { JSX } from "react";
import { OrdersScreen } from "../../features/orders/orders-screen";
import { useT } from "../../i18n/use-t";
import { Screen } from "../../ui/screen";
import { useHeaderOptions } from "../../ui/use-header-options";

// La liste des commandes, sous l'en-tête natif d'Expo Router et son retour.
export default function Orders(): JSX.Element {
    const t = useT();
    const options = useHeaderOptions(t("orders.title"));

    return (
        <>
            <Stack.Screen options={options} />
            <Screen underHeader>
                <OrdersScreen />
            </Screen>
        </>
    );
}
