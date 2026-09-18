import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Testing Library n'installe son nettoyage automatique que lorsque le lanceur expose
// ses hooks en global. Vitest ne le fait pas par défaut, et on préfère le garder ainsi
// plutôt que de polluer l'espace de noms : le nettoyage est donc déclaré ici.
// Sans lui, chaque rendu s'ajoute au document au lieu de le remplacer, et les requêtes
// au singulier — `getByRole("button")` — échouent sur « found multiple elements » à
// partir du deuxième test du fichier.
afterEach(() => {
    cleanup();
});
