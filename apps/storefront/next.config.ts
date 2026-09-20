import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

// `standalone` produit un serveur autonome avec ses seules dépendances utiles : c'est
// ce que l'étage `runner` du Dockerfile copie, et ce qui fait la différence entre une
// image de 180 Mo et une image de 900 Mo.
//
// `transpilePackages` est requis : les packages internes sont du TypeScript brut, sans
// étape de compilation, et Next doit donc les transpiler lui-même.
const config: NextConfig = {
    output: "standalone",
    transpilePackages: [
        "@clemperl/ui",
        "@clemperl/core",
        "@clemperl/i18n",
        "@clemperl/auth",
        "@clemperl/domain",
    ],
    experimental: {
        serverActions: {
            // Trois justificatifs de 5 Mo transitent par la server action ; le défaut de
            // 1 Mo ferait échouer le dépôt avec une erreur de plateforme, hors de portée
            // du message métier. Ce plafond vaut pour des JUSTIFICATIFS : les médias
            // produit passeront par un téléversement direct, pas par ici.
            bodySizeLimit: "16mb",
        },
    },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(config);
