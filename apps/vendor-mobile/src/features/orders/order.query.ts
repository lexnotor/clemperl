import { graphql } from "../../graphql/generated";

// Ce que le détail d'une commande demande à l'API. Les montants arrivent formatés, dans la devise
// de la commande. `actions` n'y est pas : les boutons attendent T8d.
export const ORDER_QUERY = graphql(`
    query Order($id: ID!) {
        order(id: $id) {
            id
            reference
            status
            placedAt
            lines {
                id
                title
                variantLabel
                quantity
                total
            }
            total
            paymentMethod
            paymentStatus
            shipTo {
                name
                line
                city
                country
                phone
            }
            note
            dispute
        }
    }
`);
