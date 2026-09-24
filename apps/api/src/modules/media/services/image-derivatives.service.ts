import { DERIVATIVE_WIDTHS, IMAGE_FAILURE } from "@clemperl/domain";
import { Injectable } from "@nestjs/common";
import sharp from "sharp";

export interface IDerivative {
    width: number;
    content: Buffer;
}

export interface IDeriveResult {
    width: number;
    height: number;
    derivatives: IDerivative[];
}

// Cinquante millions de pixels. C'est NETTEMENT sous la limite par défaut de sharp
// (268 millions), et c'est voulu : un catalogue n'a aucun usage d'une image de plus de
// 50 M, et l'intervalle entre les deux limites est exactement celui où un fichier de
// 75 Ko sur le disque demande des gigaoctets à décompresser.
//
// Le worker partageant son conteneur avec l'API, un OOM ici emporterait les deux.
const MAX_INPUT_PIXELS = 50_000_000;

// Les orientations 5 à 8 comportent un QUART DE TOUR : la photo est rangée couchée et
// l'appareil note qu'il faut la redresser. Les dimensions lues sur l'en-tête décrivent
// alors l'image rangée, pas celle qu'on servira — et un téléphone tenu en portrait
// produit exactement cela, ce qui en fait le cas majoritaire et non le cas limite.
//
// Pure, donc les huit valeurs se vérifient sans fabriquer huit fichiers. Une valeur hors
// plage ne permute pas : sharp ne redresserait pas non plus, et permuter ici ferait
// mentir les dimensions rangées en base.
export function orientedSize(
    width: number | undefined,
    height: number | undefined,
    orientation: number | undefined,
): { width: number | undefined; height: number | undefined } {
    const tourne = orientation !== undefined && orientation >= 5 && orientation <= 8;
    return tourne ? { width: height, height: width } : { width, height };
}

// La DÉCISION est séparée de la lecture : sharp est un binaire natif dont on ne choisit
// pas les sorties, mais « ces dimensions sont-elles utilisables » est une question pure,
// qui se teste exhaustivement sans fabriquer un fichier pour chaque cas.
//
// Rend la clé du refus, ou `null` si l'image passe. Accepte `undefined` parce que c'est
// exactement ce que sharp rend pour un format qu'il parse sans y lire de taille : traiter
// ce cas ICI le rend testable, alors qu'un `?? 0` chez l'appelant serait une branche que
// rien n'exercerait jamais.
export function rejectionFor(width: number | undefined, height: number | undefined): string | null {
    if (!width || !height) {
        return IMAGE_FAILURE.unreadable;
    }
    if (width * height > MAX_INPUT_PIXELS) {
        return IMAGE_FAILURE.tooLarge;
    }
    if (width < DERIVATIVE_WIDTHS[0]) {
        return IMAGE_FAILURE.tooSmall;
    }
    return null;
}

// sharp est isolé dans un service et non appelé depuis le processeur : c'est du calcul
// pur, il se teste sans file, sans base et sans réseau.
@Injectable()
export class ImageDerivativesService {
    async derive(original: Buffer): Promise<IDeriveResult> {
        // Les MÉTADONNÉES d'abord. Elles se lisent sur l'en-tête, sans décompresser un
        // seul pixel : c'est ce qui permet de refuser une image démesurée au lieu d'être
        // tué en la décodant.
        let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
        try {
            metadata = await sharp(original).metadata();
        } catch (error) {
            throw new Error(IMAGE_FAILURE.unreadable, { cause: error });
        }

        // Le refus se juge sur les dimensions REDRESSÉES, parce que ce sont celles qu'on
        // servira. Jugée sur les dimensions rangées, une photo portrait de 200 px de
        // large passerait pour large de 5000.
        const brut = orientedSize(metadata.width, metadata.height, metadata.orientation);
        const refus = rejectionFor(brut.width, brut.height);
        if (refus) {
            throw new Error(refus);
        }

        // Après `rejectionFor`, les deux sont des nombres non nuls — mais TypeScript ne
        // le déduit pas d'un prédicat qui rend une chaîne. L'affirmer ici est plus
        // honnête qu'un repli qui masquerait un cas déjà traité.
        const width = brut.width as number;
        const height = brut.height as number;

        const derivatives = await Promise.all(
            DERIVATIVE_WIDTHS.map(async (target) => ({
                width: target,
                // `withoutEnlargement` : une image de 900 px ne devient pas un 1600 px
                // flou et deux fois plus lourd que l'original.
                content: await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS })
                    // `.rotate()` SANS argument applique l'orientation EXIF. Sans lui,
                    // `.resize()` travaille sur l'image rangée : une photo prise en
                    // portrait est servie couchée, et la largeur demandée s'applique au
                    // mauvais côté. C'est le cas majoritaire, pas un cas limite.
                    .rotate()
                    .resize({ width: target, withoutEnlargement: true })
                    .webp({ quality: 82 })
                    .toBuffer(),
            })),
        );

        return { width, height, derivatives };
    }
}
