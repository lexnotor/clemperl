// Ce que le formulaire remet dans ses champs à la resoumission. Les fichiers n'y
// figurent pas : un champ de type `file` ne se préremplit pas, et le libellé dit donc
// qu'une pièce laissée vide reste celle déjà déposée.
export interface IApplicationValues {
    applicationId: string;
    shopName: string;
    shopDescription: string;
    contactEmail: string;
    contactPhone: string;
    categories: string[];
    legalForm: string;
    legalName: string;
    registrationNumber: string;
    taxNumber: string | null;
    country: string;
}
