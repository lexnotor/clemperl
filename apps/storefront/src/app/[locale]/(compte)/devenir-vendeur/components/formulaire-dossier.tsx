"use client";

import { Button } from "@clemperl/ui";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, type JSX } from "react";
import { deposerDossier } from "../actions";
import { ETAT_INITIAL } from "../types/etat-formulaire.interface";

const CATEGORIES = ["APPAREL", "JEWELLERY", "LEATHER_GOODS"] as const;
const PIECES = [
    { nom: "REGISTRY", requise: true },
    { nom: "IDENTITY", requise: true },
    { nom: "TAX", requise: false },
] as const;

const CHAMP = "border border-bordure p-2";

export function FormulaireDossier(): JSX.Element {
    const t = useTranslations("vendeur.dossier");
    const tPiece = useTranslations("vendeur.piece");
    const locale = useLocale();
    const [etat, action, enCours] = useActionState(deposerDossier, ETAT_INITIAL);

    return (
        <form action={action} className="mt-8 flex flex-col gap-6">
            <input type="hidden" name="locale" value={locale} />

            <fieldset className="flex flex-col gap-4">
                <legend className="font-medium">{t("sectionBoutique")}</legend>
                <label className="flex flex-col gap-1">
                    {t("nomBoutique")}
                    <input name="shopName" required minLength={2} maxLength={80} className={CHAMP} />
                </label>
                <label className="flex flex-col gap-1">
                    {t("description")}
                    <textarea
                        name="shopDescription"
                        required
                        minLength={20}
                        maxLength={2000}
                        rows={4}
                        className={CHAMP}
                    />
                </label>
                <label className="flex flex-col gap-1">
                    {t("emailContact")}
                    <input name="contactEmail" type="email" required className={CHAMP} />
                </label>
                <label className="flex flex-col gap-1">
                    {t("telephoneContact")}
                    <input name="contactPhone" required className={CHAMP} />
                </label>
                <fieldset className="flex flex-col gap-1">
                    <legend>{t("categories")}</legend>
                    {CATEGORIES.map((categorie) => (
                        <label key={categorie} className="flex items-center gap-2">
                            <input type="checkbox" name="categories" value={categorie} />
                            {t(`categorie.${categorie}`)}
                        </label>
                    ))}
                </fieldset>
            </fieldset>

            <fieldset className="flex flex-col gap-4">
                <legend className="font-medium">{t("sectionLegale")}</legend>
                <label className="flex flex-col gap-1">
                    {t("formeJuridique")}
                    <input name="legalForm" required className={CHAMP} />
                </label>
                <label className="flex flex-col gap-1">
                    {t("raisonSociale")}
                    <input name="legalName" required className={CHAMP} />
                </label>
                <label className="flex flex-col gap-1">
                    {t("numeroEnregistrement")}
                    <input name="registrationNumber" required className={CHAMP} />
                </label>
                <label className="flex flex-col gap-1">
                    {t("numeroTva")}
                    <input name="taxNumber" className={CHAMP} />
                </label>
                <label className="flex flex-col gap-1">
                    {t("pays")}
                    <input name="country" required maxLength={2} className={CHAMP} />
                </label>
            </fieldset>

            <fieldset className="flex flex-col gap-4">
                <legend className="font-medium">{t("sectionPieces")}</legend>
                {PIECES.map(({ nom, requise }) => (
                    <label key={nom} className="flex flex-col gap-1">
                        {tPiece(nom)}
                        {!requise && <span className="text-sm opacity-70">{t("facultative")}</span>}
                        <input
                            name={nom}
                            type="file"
                            required={requise}
                            accept="application/pdf,image/jpeg,image/png"
                            className={CHAMP}
                        />
                    </label>
                ))}
            </fieldset>

            {etat.message.length > 0 && (
                <ul role="alert" className="flex flex-col gap-1 text-sm">
                    {etat.message.map((ligne) => (
                        <li key={ligne}>{ligne}</li>
                    ))}
                </ul>
            )}

            <Button type="submit" disabled={enCours}>
                {enCours ? t("envoiEnCours") : t("valider")}
            </Button>
        </form>
    );
}
