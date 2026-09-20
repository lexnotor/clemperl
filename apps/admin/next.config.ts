import type { NextConfig } from "next";

// Pas de greffon next-intl ici : cette application ne sert qu'une langue et n'a donc
// aucune négociation à faire. Les libellés viennent du catalogue `admin`.
const config: NextConfig = {
    output: "standalone",
    transpilePackages: [
        "@clemperl/ui",
        "@clemperl/core",
        "@clemperl/i18n",
        "@clemperl/auth",
        "@clemperl/domain",
    ],
};

export default config;
