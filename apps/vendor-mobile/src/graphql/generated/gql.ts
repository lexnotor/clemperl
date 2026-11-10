/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n    query Order($id: ID!) {\n        order(id: $id) {\n            id\n            reference\n            status\n            placedAt\n            lines {\n                id\n                title\n                variantLabel\n                quantity\n                total\n            }\n            total\n            paymentMethod\n            paymentStatus\n            shipTo {\n                name\n                line\n                city\n                country\n                phone\n            }\n            note\n            dispute\n        }\n    }\n": typeof types.OrderDocument,
    "\n    query Orders {\n        orders {\n            id\n            reference\n            customerName\n            status\n            paymentStatus\n            total\n            placedAt\n            dispute\n        }\n    }\n": typeof types.OrdersDocument,
    "\n    query Me {\n        me {\n            user {\n                email\n            }\n            shop {\n                name\n                suspended\n            }\n        }\n    }\n": typeof types.MeDocument,
};
const documents: Documents = {
    "\n    query Order($id: ID!) {\n        order(id: $id) {\n            id\n            reference\n            status\n            placedAt\n            lines {\n                id\n                title\n                variantLabel\n                quantity\n                total\n            }\n            total\n            paymentMethod\n            paymentStatus\n            shipTo {\n                name\n                line\n                city\n                country\n                phone\n            }\n            note\n            dispute\n        }\n    }\n": types.OrderDocument,
    "\n    query Orders {\n        orders {\n            id\n            reference\n            customerName\n            status\n            paymentStatus\n            total\n            placedAt\n            dispute\n        }\n    }\n": types.OrdersDocument,
    "\n    query Me {\n        me {\n            user {\n                email\n            }\n            shop {\n                name\n                suspended\n            }\n        }\n    }\n": types.MeDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query Order($id: ID!) {\n        order(id: $id) {\n            id\n            reference\n            status\n            placedAt\n            lines {\n                id\n                title\n                variantLabel\n                quantity\n                total\n            }\n            total\n            paymentMethod\n            paymentStatus\n            shipTo {\n                name\n                line\n                city\n                country\n                phone\n            }\n            note\n            dispute\n        }\n    }\n"): (typeof documents)["\n    query Order($id: ID!) {\n        order(id: $id) {\n            id\n            reference\n            status\n            placedAt\n            lines {\n                id\n                title\n                variantLabel\n                quantity\n                total\n            }\n            total\n            paymentMethod\n            paymentStatus\n            shipTo {\n                name\n                line\n                city\n                country\n                phone\n            }\n            note\n            dispute\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query Orders {\n        orders {\n            id\n            reference\n            customerName\n            status\n            paymentStatus\n            total\n            placedAt\n            dispute\n        }\n    }\n"): (typeof documents)["\n    query Orders {\n        orders {\n            id\n            reference\n            customerName\n            status\n            paymentStatus\n            total\n            placedAt\n            dispute\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query Me {\n        me {\n            user {\n                email\n            }\n            shop {\n                name\n                suspended\n            }\n        }\n    }\n"): (typeof documents)["\n    query Me {\n        me {\n            user {\n                email\n            }\n            shop {\n                name\n                suspended\n            }\n        }\n    }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;