import { useQuery } from "@apollo/client/react";
import type { JSX } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatDate } from "../../i18n/format-date";
import { useLocale } from "../../i18n/use-locale";
import { useT } from "../../i18n/use-t";
import { Notice } from "../../ui/notice";
import { QueryGate } from "../../ui/query-gate";
import { useTheme } from "../../ui/use-theme";
import { ORDER_QUERY } from "./order.query";

interface OrderScreenProps {
    id: string;
}

// Le détail d'une commande, en lecture. L'historique des paiements et le fil du litige restent
// sur le web (spec T8, section 5) ; les boutons d'action arrivent en T8d.
export function OrderScreen({ id }: OrderScreenProps): JSX.Element {
    const t = useT();
    const theme = useTheme();
    const locale = useLocale();
    // `notifyOnNetworkStatusChange` : sans lui, « Réessayer » relance la requête sans que
    // l'écran repasse par l'attente.
    const result = useQuery(ORDER_QUERY, { variables: { id }, notifyOnNetworkStatusChange: true });

    return (
        <QueryGate result={result}>
            {({ order }) => {
                // `null` : identifiant inconnu, mal formé ou d'une autre boutique. L'API ne
                // distingue pas ces cas, l'écran non plus.
                if (order === null || order === undefined) {
                    return <Text style={{ color: theme.muted }}>{t("orders.notFound")}</Text>;
                }
                const heading = [styles.heading, { color: theme.text }];
                return (
                    <>
                        <Text style={[styles.reference, { color: theme.text }]}>
                            {order.reference}
                        </Text>
                        <Text style={{ color: theme.text }}>
                            {t(`orders.status.${order.status}`)}
                        </Text>
                        <Text style={{ color: theme.muted }}>
                            {t("orders.placedOn", { date: formatDate(order.placedAt, locale) })}
                        </Text>
                        {order.dispute !== null && order.dispute !== undefined && (
                            <Notice text={t(`orders.dispute.${order.dispute}`)} />
                        )}

                        <Text style={heading}>{t("orders.lines")}</Text>
                        {order.lines.map((line) => (
                            <View key={line.id} style={styles.line}>
                                <Text style={[styles.grow, { color: theme.text }]}>
                                    {`${line.title}${
                                        line.variantLabel === "" ? "" : ` (${line.variantLabel})`
                                    } x${line.quantity}`}
                                </Text>
                                <Text style={{ color: theme.text }}>{line.total}</Text>
                            </View>
                        ))}
                        <Text style={[styles.total, { color: theme.text }]}>
                            {t("orders.total", { amount: order.total })}
                        </Text>

                        <Text style={heading}>{t("payment.title")}</Text>
                        <Text style={{ color: theme.text }}>
                            {t(`payment.method.${order.paymentMethod}`)}
                        </Text>
                        <Text style={{ color: theme.muted }}>
                            {t(`payment.status.${order.paymentStatus}`)}
                        </Text>

                        <Text style={heading}>{t("orders.shipTo")}</Text>
                        <Text style={{ color: theme.text }}>{order.shipTo.name}</Text>
                        <Text style={{ color: theme.text }}>{order.shipTo.line}</Text>
                        <Text style={{ color: theme.text }}>
                            {`${order.shipTo.city}, ${order.shipTo.country}`}
                        </Text>
                        <Text style={{ color: theme.text }}>{order.shipTo.phone}</Text>

                        {order.note !== null && order.note !== undefined && order.note !== "" && (
                            <>
                                <Text style={heading}>{t("orders.note")}</Text>
                                <Text style={{ color: theme.text }}>{order.note}</Text>
                            </>
                        )}
                    </>
                );
            }}
        </QueryGate>
    );
}

const styles = StyleSheet.create({
    reference: { fontSize: 24, fontWeight: "600" },
    heading: { fontSize: 18, fontWeight: "600", marginTop: 8 },
    line: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    grow: { flex: 1 },
    total: { fontWeight: "600" },
});
