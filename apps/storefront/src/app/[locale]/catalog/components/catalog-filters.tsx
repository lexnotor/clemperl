"use client";

import { CATALOG_SORTS, PRODUCT_CATEGORIES } from "@clemperl/domain/browser";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, JSX } from "react";

interface CatalogFiltersProps {
    labels: Record<string, string>;
    categoryLabels: Record<string, string>;
}

// Client, parce qu'il ÉCRIT dans l'URL. Les filtres y vivent plutôt que dans un état React :
// une liste filtrée se partage et s'indexe, et le bouton Retour du navigateur retrouve le
// filtre précédent sans qu'on écrive quoi que ce soit.
export function CatalogFilters(props: CatalogFiltersProps): JSX.Element {
    const router = useRouter();
    const params = useSearchParams();

    function onSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const suivants = new URLSearchParams();
        for (const cle of ["q", "category", "sort"]) {
            const valeur = String(form.get(cle) ?? "").trim();
            if (valeur !== "") {
                suivants.set(cle, valeur);
            }
        }
        // La page repart à 1 : garder la page courante après un changement de filtre
        // montrerait une page vide sans que rien ne l'explique.
        router.push(`?${suivants.toString()}`);
    }

    return (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
                {props.labels["searchLabel"]}
                <input
                    name="q"
                    defaultValue={params.get("q") ?? ""}
                    placeholder={props.labels["searchPlaceholder"]}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                />
            </label>

            <label className="flex flex-col gap-1 text-sm">
                {props.labels["categoryLabel"]}
                <select
                    name="category"
                    defaultValue={params.get("category") ?? ""}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                >
                    <option value="">{props.labels["categoryAll"]}</option>
                    {PRODUCT_CATEGORIES.map((value) => (
                        <option key={value} value={value}>
                            {props.categoryLabels[value] ?? value}
                        </option>
                    ))}
                </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
                {props.labels["sortLabel"]}
                <select
                    name="sort"
                    defaultValue={params.get("sort") ?? "newest"}
                    className="border border-bordure bg-transparent px-3 py-2 text-sm"
                >
                    {CATALOG_SORTS.map((value) => (
                        <option key={value} value={value}>
                            {props.labels[`sort_${value}`] ?? value}
                        </option>
                    ))}
                </select>
            </label>

            <button type="submit" className="border border-bordure px-4 py-2 text-sm">
                {props.labels["searchLabel"]}
            </button>
        </form>
    );
}
