const { UIBuilder } = require("../userInterface.js");

describe("UIBuilder action parameters", () => {
  test("_buildBufferParameters() preserves attendance mode for replacement flows", () => {
    const ui = new UIBuilder({});

    const parameters = ui._buildBufferParameters(
      "calendar-1",
      "event-1",
      {
        eventApiId: "api-id",
        attendanceMode: "online",
        hasActiveBuffer: "true"
      },
      {
        resolvedLocation: "https://meet.google.com/hybrid-link"
      }
    );

    expect(parameters).toEqual(expect.objectContaining({
      calendarId: "calendar-1",
      eventId: "event-1",
      eventApiId: "api-id",
      attendanceMode: "online",
      resolvedLocation: "https://meet.google.com/hybrid-link",
      hasActiveBuffer: "true"
    }));
  });
});
