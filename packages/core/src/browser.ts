// Point d'entrée SANS dépendance serveur, destiné aux composants client.
//
// Le barillet principal expose l'envoi de courriels, la file BullMQ et le client de stockage,
// qui tirent nodemailer, ioredis, `child_process` et `node:net` : Turbopack refuse alors
// d'assembler le paquet navigateur, sur un « Module not found » qui ne nomme que le dernier
// maillon. Même raisonnement que `@clemperl/domain/browser` : un sous-chemin étroit vaut
// mieux qu'un barillet qu'on n'ose plus importer.
//
// N'y ajouter que des fichiers qui n'importent rien, ou d'autres fichiers de cette liste.
export * from "./constants/realtime.constant.js";
export * from "./enums/realtime-event.enum.js";
export type * from "./interfaces/realtime-event.interface.js";
