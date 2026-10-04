import messages from "@clemperl/i18n/messages/vendor/fr.json";
import type { JSX } from "react";
import { addCollectionItem, moveCollectionItem, removeCollectionItem } from "./actions";

const t = messages.collections;

interface Item {
    productId: string;
    product: { title: string; status: string };
}

interface CollectionItemsProps {
    collectionId: string;
    items: readonly Item[];
    /** Les produits du vendeur qui ne sont pas encore rangés ici. */
    available: readonly { id: string; title: string }[];
}

// Un composant SERVEUR, et des formulaires ordinaires. Deux boutons plutôt qu'un
// glisser-déposer : accessibles au clavier d'office, visables par leur nom accessible, et
// l'écran fonctionne sans JavaScript. Le glisser-déposer aurait demandé une bibliothèque
// et une histoire au clavier à écrire soi-même.
export function CollectionItems(props: CollectionItemsProps): JSX.Element {
    return (
        <section className="mt-12 border-t border-bordure pt-8">
            <h2 className="font-titre text-xl">{t.itemsSection}</h2>
            <p className="mt-2 text-sm text-muet">{t.itemsHint}</p>

            {props.items.length === 0 ? (
                <p className="mt-6 text-sm text-muet">{t.noItem}</p>
            ) : (
                <ol className="mt-6 flex flex-col">
                    {props.items.map((item, index) => (
                        <li
                            key={item.productId}
                            className="flex items-center gap-4 border-t border-bordure py-3"
                        >
                            <span className="w-6 text-sm text-muet">{index + 1}.</span>
                            <span className="flex-1">
                                {item.product.title}
                                {item.product.status !== "PUBLISHED" && (
                                    <span className="ml-2 text-xs text-muet">
                                        ({t.notVisible})
                                    </span>
                                )}
                            </span>
                            {(["up", "down"] as const).map((direction) => (
                                <form key={direction} action={moveCollectionItem}>
                                    <input
                                        type="hidden"
                                        name="collectionId"
                                        value={props.collectionId}
                                    />
                                    <input type="hidden" name="productId" value={item.productId} />
                                    <input type="hidden" name="direction" value={direction} />
                                    <button
                                        type="submit"
                                        className="text-sm underline disabled:opacity-40"
                                        disabled={
                                            direction === "up"
                                                ? index === 0
                                                : index === props.items.length - 1
                                        }
                                    >
                                        {direction === "up" ? t.moveUp : t.moveDown}
                                    </button>
                                </form>
                            ))}
                            <form action={removeCollectionItem}>
                                <input
                                    type="hidden"
                                    name="collectionId"
                                    value={props.collectionId}
                                />
                                <input type="hidden" name="productId" value={item.productId} />
                                <button type="submit" className="text-sm text-muet underline">
                                    {t.remove}
                                </button>
                            </form>
                        </li>
                    ))}
                </ol>
            )}

            {props.available.length === 0 ? (
                <p className="mt-8 text-sm text-muet">{t.noProductLeft}</p>
            ) : (
                <form action={addCollectionItem} className="mt-8 flex items-end gap-4">
                    <input type="hidden" name="collectionId" value={props.collectionId} />
                    <label className="flex flex-1 flex-col gap-1">
                        <span className="text-sm text-muet">{t.addItem}</span>
                        <select
                            name="productId"
                            required
                            className="w-full border-0 border-b border-bordure bg-transparent px-0 py-2 text-base outline-none focus:border-texte"
                        >
                            {props.available.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button type="submit" className="pb-2 text-sm underline">
                        {t.addItem}
                    </button>
                </form>
            )}
        </section>
    );
}
