// Vérifie que chaque seuil de couverture par fichier désigne un fichier existant.
//
// Jest fait échouer son run quand une entrée de seuil pointe vers un fichier absent,
// ce qui empêche une exigence de disparaître en silence avec un renommage. Vitest ne
// le fait pas — vérifié le 2026-09-18 en ajoutant une entrée bidon : le run passe sans
// rien signaler. Ce script rétablit le garde-fou.
import { readFileSync, existsSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname, resolve } from "node:path";

const configs = globSync("packages/*/vitest.config.ts");
let fautes = 0;

for (const config of configs) {
    const contenu = readFileSync(config, "utf8");
    // Une clé de seuil par fichier est une chaîne entre guillemets contenant un `/`.
    for (const [, chemin] of contenu.matchAll(/"([^"]*\/[^"]*\.(?:ts|tsx))"\s*:\s*\{/g)) {
        const absolu = resolve(dirname(config), chemin);
        if (!existsSync(absolu)) {
            console.error(`${config} : seuil défini pour un fichier absent — ${chemin}`);
            fautes += 1;
        }
    }
}

if (fautes > 0) {
    console.error(`\n${fautes} seuil(s) par fichier orphelin(s). Mettre à jour ou retirer l'entrée.`);
    process.exit(1);
}
console.log(`${configs.length} configuration(s) vérifiée(s), aucun seuil orphelin.`);
