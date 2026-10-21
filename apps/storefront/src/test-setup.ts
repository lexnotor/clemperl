import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library n'installe son nettoyage automatique que lorsque le lanceur expose ses
// hooks en global, ce que Vitest ne fait pas ici. Sans ce nettoyage, chaque rendu s'ajoute
// au document au lieu de le remplacer, et une requête au singulier (`getByRole("status")`)
// trouve plusieurs éléments dès le deuxième test d'un fichier. Sans effet sur les tests qui
// tournent sous Node : ils ne rendent rien.
afterEach(() => {
    cleanup();
});
