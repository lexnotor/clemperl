import { arreterBaseDeTest } from "./base-de-test";

export default async function globalTeardown(): Promise<void> {
    await arreterBaseDeTest();
}
