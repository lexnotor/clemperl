import { deviceLocale } from "./locale";

describe("deviceLocale", () => {
    it("suit le téléphone en français et en anglais", () => {
        expect(deviceLocale("fr")).toBe("fr");
        expect(deviceLocale("en")).toBe("en");
    });

    // Le marché visé parle français : une langue que l'application ne connaît pas retombe sur
    // lui, jamais sur des clés brutes.
    it("retombe sur le français pour toute autre langue, ou sans langue", () => {
        expect(deviceLocale("es")).toBe("fr");
        expect(deviceLocale(null)).toBe("fr");
    });
});
