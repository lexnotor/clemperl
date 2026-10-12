import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

// La clé est lue au démarrage et non à chaque appel : une clé absente doit arrêter le
// processus avec son nom, et non échouer au premier webhook, des heures plus tard.
export function readPayloadKey(raw: string | undefined): Buffer {
    const key = Buffer.from(raw ?? "", "base64");
    if (key.length !== KEY_LENGTH) {
        throw new Error(
            "PAYMENT_PAYLOAD_KEY doit valoir 32 octets encodés en base64.",
        );
    }
    return key;
}

// On stocke l'IV, le sceau, puis le chiffré. L'IV est tiré à chaque appel : en GCM, le
// réutiliser avec la même clé livre le OU exclusif des deux clairs, et surtout la clé
// d'authentification, ce qui permet de forger un sceau valide.
export function encryptPayload(key: Buffer, clear: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    const body = Buffer.concat([cipher.update(clear, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

// La longueur du sceau est imposée des deux côtés : sans elle, `setAuthTag` accepte des
// sceaux de 4, 8 et 12 à 15 octets, et un tampon tronqué en base passerait le
// déchiffrement avec un sceau affaibli.
export function decryptPayload(key: Buffer, stored: Buffer): string {
    const iv = stored.subarray(0, IV_LENGTH);
    const tag = stored.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const body = stored.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
