import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, isSupportedLocale } from "./config";

describe("configuration des locales", () => {
    it("place le français en locale par défaut", () => {
        expect(DEFAULT_LOCALE).toBe("fr");
    });

    it("expose exactement le français et l'anglais", () => {
        expect(LOCALES).toEqual(["fr", "en"]);
    });

    it("reconnaît une locale supportée", () => {
        expect(isSupportedLocale("fr")).toBe(true);
        expect(isSupportedLocale("en")).toBe(true);
    });

    it("rejette une locale inconnue", () => {
        expect(isSupportedLocale("de")).toBe(false);
        expect(isSupportedLocale("")).toBe(false);
    });
});
