import { graphql } from "../../graphql/generated";

// Ce que la liste des commandes demande à l'API. `total` arrive déjà formaté, dans la devise de
// la commande ; `dispute` est le signal que le domaine calcule, jamais un état de litige brut.
export const ORDERS_QUERY = graphql(`
    query Orders {
        orders {
            id
            reference
            customerName
            status
            paymentStatus
            total
            placedAt
            dispute
        }
    }
`);
