import { formatDate } from "./format-date";

describe("formatDate", () => {
    it("écrit la date en français", () => {
        expect(formatDate("2026-11-10T09:00:00.000Z", "fr")).toBe("10 novembre 2026");
    });

    it("écrit la date en anglais", () => {
        expect(formatDate("2026-11-10T09:00:00.000Z", "en")).toBe("November 10, 2026");
    });
});
