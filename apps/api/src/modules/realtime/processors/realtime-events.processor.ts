import { REALTIME_EVENTS_QUEUE, type TRealtimeEvent } from "@clemperl/core";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { RealtimeService } from "../services";

// Consomme ce que les fronts déposent après leurs écritures.
//
// BullMQ ne retente un job que si `process` lève, et `publish` ne rejette jamais : chaque job
// est joué UNE fois. Un objet disparu se termine donc sans relance, et c'est voulu. Une base
// coupée pendant la lecture perd l'alerte, que le service journalise : la page la rattrape à
// son prochain affichage ou à la reconnexion. Ne pas faire lever ici pour obtenir des
// relances : l'alerte arriverait des secondes plus tard, sur une page peut-être déjà relue.
@Processor(REALTIME_EVENTS_QUEUE)
export class RealtimeEventsProcessor extends WorkerHost {
    constructor(private readonly realtime: RealtimeService) {
        super();
    }

    async process(job: Job<TRealtimeEvent>): Promise<void> {
        await this.realtime.publish(job.data);
    }
}
