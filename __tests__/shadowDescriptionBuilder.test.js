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

  test("_toPlainText() strips markup and preserves readable line breaks", () => {
    const builder = new ShadowDescriptionBuilder();

    const plainText = builder._toPlainText(
      "Video: <a href='https://meet.google.com/example'>https://meet.google.com/example</a><br><br><div>Phone: +44 20 1111 2222</div>"
    );

    expect(plainText).toContain("Video: https://meet.google.com/example");
    expect(plainText).toContain("Phone: +44 20 1111 2222");
    expect(plainText).not.toContain("<a");
    expect(plainText).not.toContain("<div");
  });

  test("build() includes the explanatory text, start time, plain-text conference details, and notes", () => {
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
    expect(description).toContain("Video: https://meet.google.com/example");
    expect(description).not.toContain("<a");
    expect(description).not.toContain("<br>");
  });
});
