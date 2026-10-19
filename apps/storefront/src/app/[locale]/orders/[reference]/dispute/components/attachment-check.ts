import { attachmentViolations, type IDisputeViolation } from "@clemperl/domain/browser";

// Contrôle les pièces choisies AVANT l'envoi, avec la règle du serveur. Au-delà de 16 Mo,
// Next refuse le corps de l'action sans qu'elle tourne : sans ce contrôle, l'acheteur
// perdrait sa page et son récit sans lire pourquoi. Le serveur reste juge : ce contrôle ne
// fait qu'empêcher un envoi qu'il refuserait.
export function checkAttachments(
    input: HTMLInputElement,
    describe: (violation: IDisputeViolation) => string,
): void {
    const files = Array.from(input.files ?? []);
    const [first] = attachmentViolations(
        files.map((file) => ({ mimeType: file.type, sizeBytes: file.size })),
    );
    input.setCustomValidity(first === undefined ? "" : describe(first));
    if (first !== undefined) {
        input.reportValidity();
    }
}
