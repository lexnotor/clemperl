import type { Config } from "jest";

// Transformation partagée par les quatre configurations Jest. Elle est définie une
// seule fois : dupliquée, elle divergerait au premier réglage ajouté d'un seul côté.
//
// Deux entrées sont nécessaires, et non une seule :
//   - le TypeScript du dépôt utilise les décorateurs NestJS, que swc ne parse que si
//     on les active explicitement, avec les métadonnées dont l'injection dépend ;
//   - NestJS 12 est publié en ESM pur, sans point d'entrée CommonJS. Jest tournant en
//     CommonJS, ses fichiers `.js` doivent être convertis, d'où `transformIgnorePatterns`
//     qui lève l'exclusion de `node_modules` pour ce seul paquet.
export const transform: Config["transform"] = {
    "^.+\\.ts$": [
        "@swc/jest",
        {
            jsc: {
                parser: { syntax: "typescript", decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true },
                target: "es2022",
            },
            module: { type: "commonjs" },
        },
    ],
    "^.+\\.js$": [
        "@swc/jest",
        {
            jsc: { parser: { syntax: "ecmascript" }, target: "es2022" },
            module: { type: "commonjs" },
        },
    ],
};

export const transformIgnorePatterns = ["/node_modules/.pnpm/(?!@nestjs)"];
