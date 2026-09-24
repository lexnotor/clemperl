"use client";

// `@clemperl/domain/browser` et non le barillet : celui-ci réexporte les erreurs du
// domaine, qui tirent `@clemperl/core`, qui tire nodemailer, qui tire `node:net`. Le
// sous-chemin ne contient que des fonctions pures — `buildOriginalPath` et son
// `node:crypto` vivent ailleurs, côté serveur.
import { derivativePath, isRetryableImageFailure } from "@clemperl/domain/browser";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Field } from "@clemperl/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type JSX } from "react";
import {
    removeImage,
    reorderProductImages,
    retryImage,
    saveImageAltText,
    uploadProductImage,
} from "./actions";

export interface IProductImageRow {
    id: string;
    status: string;
    objectPath: string;
    altText: string | null;
    failureReason: string | null;
}

interface ProductImagesProps {
    productId: string;
    images: IProductImageRow[];
    /** Origine de la BOUTIQUE : c'est elle, et elle seule, qui porte la route de relais. */
    mediaOrigin: string;
}

export function ProductImages(props: ProductImagesProps): JSX.Element {
    const t = messages.products;
    const failures = messages.imageFailure as Record<string, string>;
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pending = props.images.some((image) => image.status === "PENDING");

    // Tant qu'une image attend, la page se redemande au serveur. Pas de WebSocket : le
    // temps réel est T7, et une file de quelques secondes ne le justifie pas. L'intervalle
    // s'arrête dès que plus rien n'attend, sinon il tournerait pour rien indéfiniment.
    useEffect(() => {
        if (!pending) {
            return;
        }
        const timer = setInterval(() => router.refresh(), 2000);
        return () => clearInterval(timer);
    }, [pending, router]);

    async function onFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
        const files = Array.from(event.target.files ?? []);
        // Vidé tout de suite : sans cela, redéposer le même fichier ne déclenche aucun
        // `change` et le vendeur croit que l'écran ne répond pas.
        event.target.value = "";
        setBusy(true);
        setError(null);

        // `try/finally` et non un simple enchaînement : une action serveur LÈVE quand la
        // requête n'aboutit pas — corps trop gros, réseau coupé, serveur redémarré — et
        // sans cela `setBusy(false)` n'était jamais atteint. Le sélecteur restait
        // désactivé pour de bon, sans message, et il fallait recharger la page. Le cas le
        // plus courant est le fichier qui dépasse la limite de corps, c'est-à-dire
        // exactement celui que l'écran annonce savoir refuser.
        try {
            // UN fichier à la fois, et séquentiellement : chacun traverse le serveur, et
            // les envoyer tous ensemble ferait dépasser la limite de corps d'un seul
            // appel.
            for (const file of files) {
                const payload = new FormData();
                payload.set("file", file);

                const result = await uploadProductImage(props.productId, payload);
                if ("error" in result) {
                    setError(result.error);
                    break;
                }
            }
        } catch (error) {
            console.error("uploadProductImage", error);
            setError(messages.errors.imageUploadFailed);
        } finally {
            setBusy(false);
            router.refresh();
        }
    }

    function move(index: number, delta: number): void {
        const ordered = props.images.map((image) => image.id);
        const target = index + delta;
        if (target < 0 || target >= ordered.length) {
            return;
        }
        const [moved] = ordered.splice(index, 1);
        ordered.splice(target, 0, moved as string);
        void reorderProductImages(props.productId, ordered);
    }

    return (
        <section className="mt-12 flex flex-col gap-6">
            <h2 className="text-sm text-muet">{t.imagesSection}</h2>
            <p className="text-sm text-muet">{t.imagesHint}</p>

            <label className="self-start cursor-pointer border border-bordure px-4 py-2 text-sm">
                {t.addImages}
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    disabled={busy}
                    onChange={(event) => void onFiles(event)}
                />
            </label>

            {error !== null && (
                <p role="alert" className="text-sm text-accent">
                    {error}
                </p>
            )}

            <ul className="flex flex-col">
                {props.images.map((image, index) => (
                    <li key={image.id} className="flex gap-4 border-t border-bordure py-4">
                        <div className="w-24 shrink-0">
                            {image.status === "READY" ? (
                                // Un `img` ordinaire et non `next/image` : ce sont des
                                // vignettes de 96 px dans un back-office, servies par une
                                // AUTRE origine. L'optimisation n'y gagnerait rien et
                                // demanderait d'autoriser ce domaine dans la
                                // configuration, pour un back-office que personne ne
                                // consulte au kilomètre.
                                <img
                                    data-testid="vignette"
                                    src={`${props.mediaOrigin}/api/media/${derivativePath(image.objectPath, 320)}`}
                                    alt={image.altText ?? ""}
                                    className="h-24 w-24 object-cover"
                                />
                            ) : (
                                <span className="text-xs text-muet">
                                    {image.status === "PENDING"
                                        ? t.imagePending
                                        : (failures[image.failureReason ?? ""] ?? "")}
                                </span>
                            )}
                        </div>

                        <div className="flex grow flex-col gap-2">
                            {index === 0 && <span className="text-xs text-muet">{t.imageMain}</span>}
                            <Field
                                label={t.imageAlt}
                                defaultValue={image.altText ?? ""}
                                hint={t.imageAltHint}
                                onBlur={(event) =>
                                    void saveImageAltText(
                                        image.id,
                                        props.productId,
                                        event.target.value,
                                    )
                                }
                            />
                            <div className="flex gap-4 text-xs">
                                <button type="button" className="underline" onClick={() => move(index, -1)}>
                                    {t.imageMoveUp}
                                </button>
                                <button type="button" className="underline" onClick={() => move(index, 1)}>
                                    {t.imageMoveDown}
                                </button>
                                {/* Une image en échec reste VISIBLE, avec sa raison et de
                                    quoi agir. La faire disparaître en silence serait le
                                    pire des deux mondes : le vendeur croit avoir déposé.

                                    « Réessayer » n'apparaît que si l'original existe
                                    encore. Le worker le supprime dès qu'il refuse une
                                    image : proposer le bouton dans ces cas promettait une
                                    issue qui n'existe plus, et le vendeur voyait l'échec
                                    revenir avec une autre raison. Le libellé lui dit
                                    alors de supprimer et de recommencer. */}
                                {image.status === "FAILED" &&
                                    isRetryableImageFailure(image.failureReason) && (
                                    <button
                                        type="button"
                                        className="underline"
                                        onClick={() => void retryImage(image.id)}
                                    >
                                        {t.imageRetry}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="underline"
                                    onClick={() => void removeImage(image.id, props.productId)}
                                >
                                    {t.imageRemove}
                                </button>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
