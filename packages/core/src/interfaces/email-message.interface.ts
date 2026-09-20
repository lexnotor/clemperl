// Un message sortant, indépendant du transport. Le domaine décrit ce qu'il veut dire ;
// l'adapter décide comment le faire partir.
export interface IEmailMessage {
    recipient: string;
    subject: string;
    text: string;
    html?: string;
}
