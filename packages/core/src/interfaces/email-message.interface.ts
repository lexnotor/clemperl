// Un message sortant, indépendant du transport. Le domaine décrit ce qu'il veut dire ;
// l'adapter décide comment le faire partir.
export interface IEmailMessage {
    destinataire: string;
    sujet: string;
    texte: string;
    html?: string;
}
