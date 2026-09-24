import type { NextConfig } from "next";

// Pas de greffon next-intl ici : cette application ne sert qu'une langue et n'a donc
// aucune négociation à faire. Les libellés viennent du catalogue `vendor`.
const config: NextConfig = {
    output: "standalone",
    transpilePackages: ["@clemperl/ui", "@clemperl/core", "@clemperl/i18n", "@clemperl/auth", "@clemperl/domain"],
    experimental: {
        // Les photos de produit traversent une server action, dont Next borne le corps à
        // 1 Mo par défaut. Le plafond est aligné sur celui du stockage — 5 Mo, réglé par
        // `UPLOAD_FILE_SIZE_LIMIT` dans le compose : deux plafonds différents
        // produiraient un refus que le message métier n'expliquerait pas.
        serverActions: { bodySizeLimit: "5mb" },
    },
};

export default config;
