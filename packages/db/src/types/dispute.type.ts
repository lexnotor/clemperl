import type { readDisputeForBuyer } from "../repositories/dispute.repository.js";

// Le détail d'un litige tel que ses lecteurs le reçoivent, et la forme d'un message du fil.
// DÉRIVÉS de la lecture, jamais réécrits à la main : les écrans les importent, et un champ
// ajouté au `select` du dépôt leur parvient sans qu'une copie diverge.
export type TDisputeDetail = NonNullable<Awaited<ReturnType<typeof readDisputeForBuyer>>>;
export type TDisputeMessage = TDisputeDetail["messages"][number];
