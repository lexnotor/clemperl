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

// On stocke l'IV, le sceau, puis le chiffré. L'IV est tiré à chaque appel : le réutiliser
// en GCM révèle le clair de deux messages à qui compare leurs chiffrés.
export function encryptPayload(key: Buffer, clear: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const body = Buffer.concat([cipher.update(clear, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptPayload(key: Buffer, stored: Buffer): string {
    const iv = stored.subarray(0, IV_LENGTH);
    const tag = stored.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const body = stored.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
