import "@clemperl/ui/styles/globals.css";
import type { JSX, ReactNode } from "react";

export default function RootLayout({
    children,
}: {
    children: ReactNode;
}): JSX.Element {
    return (
        <html lang="fr">
            <body>{children}</body>
        </html>
    );
}
