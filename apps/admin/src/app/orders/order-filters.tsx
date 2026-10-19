"use client";

import { Button } from "@clemperl/ui";
import type { JSX } from "react";

interface OrderFiltersProps {
    shops: { id: string; shopName: string; slug: string }[];
    statuses: { value: string; label: string }[];
    selectedShop: string;
    selectedStatus: string;
    labels: {
        shopFilter: string;
        statusFilter: string;
        allShops: string;
        allStatuses: string;
        apply: string;
    };
}

export function OrderFilters(props: OrderFiltersProps): JSX.Element {
    return (
        <form method="GET" className="mt-8 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
                {props.labels.statusFilter}
                <select
                    name="status"
                    defaultValue={props.selectedStatus}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                >
                    <option value="">{props.labels.allStatuses}</option>
                    {props.statuses.map((etat) => (
                        <option key={etat.value} value={etat.value}>
                            {etat.label}
                        </option>
                    ))}
                </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
                {props.labels.shopFilter}
                <select
                    name="shop"
                    defaultValue={props.selectedShop}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                >
                    <option value="">{props.labels.allShops}</option>
                    {props.shops.map((boutique) => (
                        <option key={boutique.id} value={boutique.id}>
                            {boutique.shopName} · {boutique.slug}
                        </option>
                    ))}
                </select>
            </label>
            <Button type="submit">{props.labels.apply}</Button>
        </form>
    );
}
