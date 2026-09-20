import { stopTestDatabase } from "./test-database";

export default async function globalTeardown(): Promise<void> {
    await stopTestDatabase();
}
