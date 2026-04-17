const { ShadowDescriptionBuilder } = require("../shadowDescriptionBuilder.js");

describe("ShadowDescriptionBuilder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("_getTimeZone() falls back to UTC when Session throws", () => {
    global.Session.getScriptTimeZone.mockImplementationOnce(() => {
      throw new Error("no timezone");
    });

    const builder = new ShadowDescriptionBuilder();
    expect(builder._getTimeZone()).toBe("Etc/UTC");
  });

  test("_getTimeZone() returns the script timezone when available", () => {
    const builder = new ShadowDescriptionBuilder();
    expect(builder._getTimeZone()).toBe("Europe/London");
  });

  test("_getTimeZone() falls back to UTC when Session is unavailable", () => {
    const builder = new ShadowDescriptionBuilder();
    const originalSession = global.Session;
    delete global.Session;

    expect(builder._getTimeZone()).toBe("Etc/UTC");

    global.Session = originalSession;
  });

  test("_getTimeZone() falls back to UTC when the script timezone is blank", () => {
    global.Session.getScriptTimeZone.mockImplementationOnce(() => "");

    const builder = new ShadowDescriptionBuilder();
    expect(builder._getTimeZone()).toBe("Etc/UTC");
  });

  test("_formatOriginalStart() returns an empty string for missing or invalid dates", () => {
    const builder = new ShadowDescriptionBuilder();

    expect(builder._formatOriginalStart(null)).toBe("");
    expect(builder._formatOriginalStart("not-a-date")).toBe("");
  });

  test("_formatOriginalStart() falls back to locale formatting when Utilities.formatDate is unavailable", () => {
    const builder = new ShadowDescriptionBuilder();
    const originalFormatDate = global.Utilities.formatDate;
    delete global.Utilities.formatDate;

    const formatted = builder._formatOriginalStart(new Date("2026-03-24T10:00:00Z"));

    global.Utilities.formatDate = originalFormatDate;

    expect(formatted).toContain("24 Mar 2026");
    expect(formatted).toContain("10:00");
  });

  test("build() includes the explanatory text, start time, conference details, and notes", () => {
    const builder = new ShadowDescriptionBuilder();

    const description = builder.build(
      "https://meet.google.com/example",
      "Bring the draft agenda.",
      "Video: <a href='https://meet.google.com/example'>https://meet.google.com/example</a>",
      new Date("2026-03-24T10:00:00Z")
    );

    expect(description).toContain("This event was created by Headstart to protect the time before your linked event.");
    expect(description).toContain("Original Start Time");
    expect(description).toContain("Conferencing Details");
    expect(description).toContain("Original Event Notes");
  });
});
