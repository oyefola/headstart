const { BufferDecisionService } = require("../bufferDecisionService.js");

describe("BufferDecisionService", () => {
  test("skips online events when online buffering is disabled and not forced", () => {
    const service = new BufferDecisionService({ bufferOnline: "false", onlineBuffer: "20" }, null);

    const result = service.decide(
      { isOnline: true, finalLocation: "https://meet.google.com/example" },
      {},
      "calendar-1",
      "AUTO"
    );

    expect(result).toEqual({
      skipped: true,
      minutes: 0,
      finalLocation: "https://meet.google.com/example"
    });
  });

  test("defaults online buffer to 15 minutes when the configured value is invalid", () => {
    const service = new BufferDecisionService({ bufferOnline: "true", onlineBuffer: "abc" }, null);

    const result = service.decide(
      { isOnline: true, finalLocation: "" },
      {},
      "calendar-1",
      "AUTO"
    );

    expect(result).toEqual({
      skipped: false,
      minutes: 15,
      finalLocation: ""
    });
  });

  test("uses the configured online buffer value when it is valid", () => {
    const service = new BufferDecisionService({ bufferOnline: "true", onlineBuffer: "20" }, null);

    const result = service.decide(
      { isOnline: true, finalLocation: "" },
      {},
      "calendar-1",
      "AUTO"
    );

    expect(result.minutes).toBe(20);
  });

  test("defaults an empty online buffer field to 15 minutes", () => {
    const service = new BufferDecisionService({ bufferOnline: "true", onlineBuffer: "" }, null);

    const result = service.decide(
      { isOnline: true, finalLocation: "" },
      {},
      "calendar-1",
      "AUTO"
    );

    expect(result.minutes).toBe(15);
  });

  test("uses the travel engine for physical events with a location", () => {
    const travelEngine = {
      resolveSmartLocation: jest.fn(() => "Resolved destination"),
      calculateDynamicBuffer: jest.fn(() => ({ minutes: 27 }))
    };
    const service = new BufferDecisionService({ bufferOnline: "true" }, travelEngine);
    const originalEvent = {
      getStartTime: jest.fn(() => new Date("2026-03-19T10:00:00Z"))
    };

    const result = service.decide(
      {
        isOnline: false,
        rawLocation: "Room 101",
        finalLocation: "Room 101"
      },
      originalEvent,
      "calendar-1",
      "AUTO"
    );

    expect(travelEngine.resolveSmartLocation).toHaveBeenCalledWith("Room 101", "calendar-1");
    expect(travelEngine.calculateDynamicBuffer).toHaveBeenCalledWith(
      "Resolved destination",
      originalEvent.getStartTime(),
      "calendar-1",
      "AUTO"
    );
    expect(result).toEqual({
      skipped: false,
      minutes: 27,
      finalLocation: "Room 101"
    });
  });

  test("throws when a physical event needs travel calculation but no travel engine is available", () => {
    const service = new BufferDecisionService({ bufferOnline: "true" }, null);

    expect(() => service.decide(
      {
        isOnline: false,
        rawLocation: "Room 101",
        finalLocation: "Room 101"
      },
      {
        getStartTime: jest.fn(() => new Date("2026-03-19T10:00:00Z"))
      },
      "calendar-1",
      "AUTO"
    )).toThrow("TravelEngine is required for location-based buffer decisions.");
  });

  test("defaults locationless in-person events to a 15 minute buffer", () => {
    const service = new BufferDecisionService({ bufferOnline: "true" }, null);

    const result = service.decide(
      {
        isOnline: false,
        rawLocation: "",
        finalLocation: ""
      },
      {},
      "calendar-1",
      "AUTO"
    );

    expect(result).toEqual({
      skipped: false,
      minutes: 15,
      finalLocation: ""
    });
  });
});
