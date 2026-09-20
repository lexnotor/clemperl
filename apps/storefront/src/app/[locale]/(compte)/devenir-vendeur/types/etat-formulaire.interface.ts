// Un seul format de sortie, qu'il y ait une ou dix fautes. Les clés sont traduites par
// la server action, jamais par le composant.
export interface IEtatFormulaire {
    message: string[];
    succes: boolean;
}

export const ETAT_INITIAL: IEtatFormulaire = { message: [], succes: false };
