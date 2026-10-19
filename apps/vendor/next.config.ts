import type { NextConfig } from "next";

// Pas de greffon next-intl ici : cette application ne sert qu'une langue et n'a donc
// aucune négociation à faire. Les libellés viennent du catalogue `vendor`.
const config: NextConfig = {
    output: "standalone",
    transpilePackages: ["@clemperl/ui", "@clemperl/core", "@clemperl/i18n", "@clemperl/auth", "@clemperl/domain"],
    experimental: {
        // Les photos de produit traversent une server action, dont Next borne le corps à
        // 1 Mo par défaut. Une photo ne dépasse pas 5 Mo, le plafond du stockage réglé par
        // `UPLOAD_FILE_SIZE_LIMIT` dans le compose. Le corps, lui, monte à 16 Mo, la valeur
        // de la boutique : une réponse à un litige porte jusqu'à trois preuves de 5 Mo, et
        // la taille de CHAQUE fichier reste bornée par le domaine et par le stockage.
        serverActions: { bodySizeLimit: "16mb" },
    },
};

export default config;
