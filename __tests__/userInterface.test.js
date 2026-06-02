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

  test("physical create, refresh, and replacement actions route through origin selection", () => {
    const ui = new UIBuilder({});

    expect(ui._getCreateOrRefreshAction({
      requiresOriginSelection: true
    })).toBe("onShowOriginSelection");
    expect(ui._getCreateOrRefreshAction({
      requiresModeSelection: true,
      requiresOriginSelection: true
    })).toBe("onShowBufferModeSelection");
    expect(ui._getCreateOrRefreshAction({})).toBe("handleCreateBuffer");

    expect(ui._getDisambiguationAction("physical", false)).toBe("onShowOriginSelection");
    expect(ui._getDisambiguationAction("online", false)).toBe("handleCreateBuffer");
    expect(ui._getDisambiguationAction("physical", true)).toBe("onConfirmBufferReplacement");

    expect(ui._getReplacementAction({ attendanceMode: "physical" })).toBe("onShowOriginSelection");
    expect(ui._getReplacementAction({ attendanceMode: "online" })).toBe("handleCreateBuffer");
  });
});
