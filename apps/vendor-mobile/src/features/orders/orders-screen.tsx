import { useQuery } from "@apollo/client/react";
import { useRouter } from "expo-router";
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatDate } from "../../i18n/format-date";
import { useLocale } from "../../i18n/use-locale";
import { useT } from "../../i18n/use-t";
import { Notice } from "../../ui/notice";
import { QueryGate } from "../../ui/query-gate";
import { useTheme } from "../../ui/use-theme";
import { ORDERS_QUERY } from "./orders.query";

export function OrdersScreen(): JSX.Element {
    const t = useT();
    const theme = useTheme();
    const locale = useLocale();
    const router = useRouter();
    // `notifyOnNetworkStatusChange` : sans lui, « Réessayer » relance la requête sans que
    // l'écran repasse par l'attente.
    const result = useQuery(ORDERS_QUERY, { notifyOnNetworkStatusChange: true });

    return (
        <QueryGate result={result}>
            {({ orders }) =>
                orders.length === 0 ? (
                    <Text style={{ color: theme.muted }}>{t("orders.empty")}</Text>
                ) : (
                    // Un `map` et non une `FlatList` : une liste virtualisée dans le `ScrollView` de
                    // `Screen` déclenche l'avertissement de React Native, et les listes d'une
                    // boutique sont courtes (spec T8, section 5).
                    orders.map((order) => (
                        <Pressable
                            key={order.id}
                            accessibilityRole="button"
                            onPress={() =>
                                router.push({ pathname: "/orders/[id]", params: { id: order.id } })
                            }
                            style={[styles.row, { borderColor: theme.border }]}
                        >
                            <View style={styles.line}>
                                <Text style={[styles.reference, { color: theme.text }]}>
                                    {order.reference}
                                </Text>
                                <Text style={{ color: theme.text }}>{order.total}</Text>
                            </View>
                            <Text style={{ color: theme.muted }}>
                                {`${t(`orders.status.${order.status}`)} · ${t(
                                    "orders.paymentLine",
                                    {
                                        status: t(`payment.status.${order.paymentStatus}`),
                                    },
                                )}`}
                            </Text>
                            <View style={styles.line}>
                                <Text style={{ color: theme.muted }}>{order.customerName}</Text>
                                <Text style={{ color: theme.muted }}>
                                    {formatDate(order.placedAt, locale)}
                                </Text>
                            </View>
                            {order.dispute !== null && order.dispute !== undefined && (
                                <Notice text={t(`orders.dispute.${order.dispute}`)} />
                            )}
                        </Pressable>
                    ))
                )
            }
        </QueryGate>
    );
}

const styles = StyleSheet.create({
    row: { borderWidth: 1, padding: 14, gap: 6 },
    line: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    reference: { fontSize: 16, fontWeight: "600" },
});
