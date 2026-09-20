import type { TNatureDocument } from "../interfaces/index.js";

// Le registre et la pièce d'identité fondent la décision ; l'attestation fiscale est un
// complément que tous les pays n'imposent pas.
export const PIECES_OBLIGATOIRES: readonly TNatureDocument[] = ["REGISTRY", "IDENTITY"];

// La même valeur que le plafond du stockage : un plafond plus haut ici produirait un
// refus technique que le message métier n'expliquerait pas.
export const TAILLE_MAX_PIECE_OCTETS = 5 * 1024 * 1024;

// Un justificatif est un PDF ou une photo. Le ZIP est exclu : il masque son contenu à
// la validation et oblige l'administration à extraire avant de lire.
export const TYPES_MIME_ACCEPTES: readonly string[] = [
    "application/pdf",
    "image/jpeg",
    "image/png",
];
