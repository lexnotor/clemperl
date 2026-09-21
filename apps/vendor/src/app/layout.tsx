import "@clemperl/ui/styles/globals.css";
import messages from "@clemperl/i18n/messages/vendor/fr.json";
import { Archivo, Spectral } from "next/font/google";
import type { JSX, ReactNode } from "react";

// `next/font` auto-héberge les fichiers et les sert depuis notre origine : pas de requête
// vers Google au rendu, et aucun saut de police au chargement.
const titre = Spectral({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--police-titre",
    display: "swap",
});

const interfaceUtilisateur = Archivo({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--police-interface",
    display: "swap",
});

// L'en-tête est STATIQUE : il ne lit ni la session ni la boutique. Un layout ne peut pas
// garder l'accès, donc il n'a rien à faire de données protégées — le nom de la boutique
// est le titre de la page, pas du cadre.
export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
    return (
        <html lang="fr" className={`${titre.variable} ${interfaceUtilisateur.variable}`}>
            <body>
                <header className="border-b border-bordure">
                    <div className="mx-auto flex max-w-3xl items-baseline justify-between px-6 py-5">
                        <a href="/" className="font-titre text-lg tracking-tight">
                            ClemPerl
                        </a>
                        <a href="/shop" className="text-sm text-muet hover:text-texte">
                            {messages.navigation.shop}
                        </a>
                    </div>
                </header>
                {children}
            </body>
        </html>
    );
}
