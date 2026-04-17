let processEventBufferMock;
let createDisambiguationCardMock;

describe("controller helpers", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("normalizeEventTime() handles Date, string, event objects, and invalid values", () => {
    const { normalizeEventTime } = require("../controller.js");
    const date = new Date("2099-04-17T10:00:00Z");

    expect(normalizeEventTime(date)).toBe(date);
    expect(normalizeEventTime("2099-04-17T10:00:00Z").toISOString()).toBe("2099-04-17T10:00:00.000Z");
    expect(normalizeEventTime({ dateTime: "2099-04-17T10:00:00Z" }).toISOString()).toBe("2099-04-17T10:00:00.000Z");
    expect(normalizeEventTime({ date: "2099-04-17" }).toISOString()).toContain("2099-04-17");
    expect(normalizeEventTime("nope")).toBeNull();
    expect(normalizeEventTime(null)).toBeNull();
    expect(normalizeEventTime({})).toBeNull();
  });

  test("encodeActionJson() and decodeActionJson() cover success and fallback branches", () => {
    const { encodeActionJson, decodeActionJson } = require("../controller.js");

    expect(encodeActionJson(null)).toBe("");
    expect(decodeActionJson({ ok: true })).toEqual({ ok: true });
    expect(decodeActionJson("not-json")).toBeNull();

    const circular = {};
    circular.self = circular;
    expect(encodeActionJson(circular)).toBe("");

    const originalDecode = global.Utilities.base64Decode;
    global.Utilities.base64Decode = jest.fn(() => {
      throw new Error("bad base64");
    });
    expect(decodeActionJson(JSON.stringify({ ok: true }))).toEqual({ ok: true });
    global.Utilities.base64Decode = originalDecode;

    const originalEncode = global.Utilities.base64Encode;
    delete global.Utilities.base64Encode;
    expect(encodeActionJson({ ok: true })).toBe(JSON.stringify({ ok: true }));
    global.Utilities.base64Encode = originalEncode;

    const originalDecodeNoBase64 = global.Utilities.base64Decode;
    const originalNewBlob = global.Utilities.newBlob;
    delete global.Utilities.base64Decode;
    delete global.Utilities.newBlob;
    expect(decodeActionJson(JSON.stringify({ raw: true }))).toEqual({ raw: true });
    global.Utilities.base64Decode = originalDecodeNoBase64;
    global.Utilities.newBlob = originalNewBlob;
  });

  test("buildEventLookupHints() prefers parameters and decodes serialized conference data", () => {
    const { buildEventLookupHints, encodeActionJson } = require("../controller.js");
    const encodedConference = encodeActionJson({ signature: "abc" });

    const hints = buildEventLookupHints(
      {
        eventApiId: "api-id",
        recurringEventId: "recurring-id",
        eventStart: "2099-04-17T10:00:00Z",
        eventEnd: "2099-04-17T11:00:00Z",
        eventConferenceData: encodedConference,
        eventHangoutLink: "https://meet.google.com/example"
      },
      {
        id: "fallback-id"
      }
    );

    expect(hints).toEqual(expect.objectContaining({
      apiEventId: "api-id",
      recurringEventId: "recurring-id",
      hangoutLink: "https://meet.google.com/example",
      conferenceData: { signature: "abc" }
    }));

    expect(buildEventLookupHints(null, {
      id: "fallback-id",
      start: { dateTime: "2099-04-17T10:00:00Z" },
      end: { dateTime: "2099-04-17T11:00:00Z" }
    })).toEqual(expect.objectContaining({
      apiEventId: "fallback-id",
      startTime: expect.any(Date),
      endTime: expect.any(Date)
    }));
    expect(buildEventLookupHints(null, null)).toEqual(expect.objectContaining({
      apiEventId: "",
      recurringEventId: "",
      conferenceData: null,
      hangoutLink: ""
    }));
  });

  test("readFormInputValue(), serializeEventTime(), and buildActionContext() normalize helper values", () => {
    const { readFormInputValue, serializeEventTime, buildActionContext } = require("../controller.js");
    const event = {
      getStartTime: jest.fn(() => new Date("2099-04-17T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2099-04-17T11:00:00Z"))
    };

    expect(readFormInputValue({ field: [" A "] }, "field")).toBe("A");
    expect(readFormInputValue({ field: " B " }, "field")).toBe("B");
    expect(readFormInputValue({ field: [] }, "field")).toBe("");
    expect(readFormInputValue({}, "field")).toBe("");
    expect(serializeEventTime(new Date("2099-04-17T10:00:00Z"))).toBe("2099-04-17T10:00:00.000Z");
    expect(serializeEventTime(null)).toBe("");
    expect(serializeEventTime({})).toBe("");

    const context = buildActionContext(event, {}, {
      nativeConferenceData: { signature: "abc" },
      meetingLink: "https://meet.google.com/example"
    });

    expect(context).toEqual(expect.objectContaining({
      eventStart: "2099-04-17T10:00:00.000Z",
      eventEnd: "2099-04-17T11:00:00.000Z",
      eventConferenceData: expect.any(String),
      eventHangoutLink: "https://meet.google.com/example"
    }));

    expect(buildActionContext(null, { hangoutLink: "https://meet.google.com/fallback" }, {})).toEqual(
      expect.objectContaining({
        eventStart: "",
        eventEnd: "",
        eventHangoutLink: "https://meet.google.com/fallback"
      })
    );
    expect(buildActionContext(event, null, null)).toEqual(expect.objectContaining({
      eventApiId: "",
      recurringEventId: "",
      eventHangoutLink: ""
    }));
  });
});

describe("onHomepage", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test("returns onboarding before the tutorial is completed and the dashboard afterwards", () => {
    global.AppSettings = jest
      .fn()
      .mockImplementationOnce(() => ({
        get: jest.fn(() => ({ bufferOnline: "true" })),
        hasSeenTutorial: jest.fn(() => false)
      }))
      .mockImplementationOnce(() => ({
        get: jest.fn(() => ({ bufferOnline: "true" })),
        hasSeenTutorial: jest.fn(() => true)
      }));
    global.UIBuilder = jest
      .fn()
      .mockImplementationOnce(() => ({
        createOnboardingCard: jest.fn(() => ({ type: "onboarding" }))
      }))
      .mockImplementationOnce(() => ({
        createDashboardCard: jest.fn(() => ({ type: "dashboard" }))
      }));

    const { onHomepage } = require("../controller.js");

    expect(onHomepage({})).toEqual({ type: "onboarding" });
    expect(onHomepage({})).toEqual({ type: "dashboard" });
  });
});

describe("handleCreateBuffer", () => {
  beforeEach(() => {
    jest.resetModules();

    processEventBufferMock = jest.fn(() => ({
      skipped: false,
      minutes: 15,
      wasUpdate: false
    }));
    const originalEvent = {
      getId: jest.fn(() => "event-1"),
      getStartTime: jest.fn(() => new Date("2099-03-18T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2099-03-18T11:00:00Z"))
    };

    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "false" }))
    }));
    global.TravelEngine = jest.fn(() => ({}));
    global.CalendarManager = jest.fn(() => ({
      getEventRobust: jest.fn(() => originalEvent),
      processEventBuffer: processEventBufferMock
    }));
    createDisambiguationCardMock = jest.fn(() => ({ type: "disambiguation" }));
    global.UIBuilder = jest.fn(() => ({
      createUnsavedEventCard: jest.fn(() => ({ type: "unsaved" })),
      createSuccessCard: jest.fn(() => ({ type: "success" })),
      createDisambiguationCard: createDisambiguationCardMock
    }));
    global.CalendarApp.getAllCalendars = jest.fn(() => []);

    const responseBuilder = {
      setNavigation: jest.fn().mockReturnThis(),
      setNotification: jest.fn().mockReturnThis(),
      setStateChanged: jest.fn().mockReturnThis(),
      build: jest.fn(() => ({ ok: true }))
    };
    const navigation = {
      updateCard: jest.fn().mockReturnThis(),
      popCard: jest.fn().mockReturnThis(),
      pushCard: jest.fn().mockReturnThis()
    };
    const notification = {
      setText: jest.fn().mockReturnThis()
    };

    global.CardService = {
      newActionResponseBuilder: jest.fn(() => responseBuilder),
      newNavigation: jest.fn(() => navigation),
      newNotification: jest.fn(() => notification)
    };
  });

  test("forces online buffering for a manual single-event action", () => {
    const { handleCreateBuffer } = require("../controller.js");

    handleCreateBuffer({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1"
      },
      calendar: {
        conferenceData: {
          entryPoints: [
            {
              entryPointType: "video",
              uri: "https://meet.google.com/action-link"
            }
          ]
        },
        hangoutLink: "https://meet.google.com/action-link"
      }
    });

    expect(processEventBufferMock).toHaveBeenCalledWith(
      expect.any(Object),
      "AUTO",
      "calendar-1",
      expect.objectContaining({
        forceOnlineBuffer: true,
        eventConferenceData: expect.any(String),
        eventHangoutLink: "https://meet.google.com/action-link"
      })
    );
  });

  test("passes through manual physical locations and refreshed notifications", () => {
    processEventBufferMock = jest.fn(() => ({
      skipped: false,
      minutes: 15,
      wasUpdate: true
    }));
    global.CalendarManager = jest.fn(() => ({
      getEventRobust: jest.fn(() => ({
        getId: jest.fn(() => "event-1"),
        getStartTime: jest.fn(() => new Date("2099-03-18T10:00:00Z")),
        getEndTime: jest.fn(() => new Date("2099-03-18T11:00:00Z")),
        isAllDayEvent: jest.fn(() => false)
      })),
      processEventBuffer: processEventBufferMock
    }));
    global.UIBuilder = jest.fn(() => ({
      createUnsavedEventCard: jest.fn(() => ({ type: "unsaved" })),
      createSuccessCard: jest.fn(() => ({ type: "success" }))
    }));

    const { handleCreateBuffer } = require("../controller.js");
    handleCreateBuffer({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1",
        attendanceMode: "physical"
      },
      formInput: {
        manualPhysicalLocation: "Room 101"
      },
      calendar: {}
    });

    expect(processEventBufferMock).toHaveBeenCalledWith(
      expect.any(Object),
      "AUTO",
      "calendar-1",
      expect.objectContaining({
        resolvedManualLocation: "Room 101",
        attendanceMode: "physical"
      })
    );
    expect(global.CardService.newNotification().setText).toHaveBeenCalledWith("Buffer refreshed in the Headstart calendar.");
  });

  test("prefers an explicitly resolved location when one is already provided in parameters", () => {
    const { handleCreateBuffer } = require("../controller.js");

    handleCreateBuffer({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1",
        resolvedLocation: "Resolved room"
      },
      formInput: {
        manualPhysicalLocation: "Ignored room"
      },
      calendar: {}
    });

    expect(processEventBufferMock).toHaveBeenCalledWith(
      expect.any(Object),
      "AUTO",
      "calendar-1",
      expect.objectContaining({
        resolvedManualLocation: "Resolved room"
      })
    );
  });

  test("continues with a manual meeting link when the event has no source location or conferencing", () => {
    const { onContinueBufferSetup } = require("../controller.js");

    onContinueBufferSetup({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1"
      },
      formInput: {
        manualMeetingLink: "https://meet.google.com/manual-link"
      },
      calendar: {}
    });

    expect(processEventBufferMock).toHaveBeenCalledWith(
      expect.any(Object),
      "AUTO",
      "calendar-1",
      expect.objectContaining({
        attendanceMode: "online",
        resolvedManualLocation: "https://meet.google.com/manual-link"
      })
    );
  });

  test("continues with a manual physical location when only that value is provided", () => {
    const { onContinueBufferSetup } = require("../controller.js");

    onContinueBufferSetup({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1"
      },
      formInput: {
        manualPhysicalLocation: "Room 101"
      },
      calendar: {}
    });

    expect(processEventBufferMock).toHaveBeenCalledWith(
      expect.any(Object),
      "AUTO",
      "calendar-1",
      expect.objectContaining({
        attendanceMode: "physical",
        resolvedManualLocation: "Room 101"
      })
    );
  });

  test("asks the user to choose between manual location and manual meeting link when both are provided", () => {
    const { onContinueBufferSetup } = require("../controller.js");

    onContinueBufferSetup({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1"
      },
      formInput: {
        manualPhysicalLocation: "Room 101",
        manualMeetingLink: "https://meet.google.com/manual-link"
      },
      calendar: {}
    });

    expect(createDisambiguationCardMock).toHaveBeenCalledWith(
      "calendar-1",
      "event-1",
      "Room 101",
      "https://meet.google.com/manual-link",
      expect.any(Object)
    );
  });

  test("rejects manual setup continuation when neither a location nor link is provided", () => {
    const { onContinueBufferSetup } = require("../controller.js");

    onContinueBufferSetup({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1"
      },
      formInput: {},
      calendar: {}
    });

    expect(processEventBufferMock).not.toHaveBeenCalled();
    expect(global.CardService.newNotification().setText).toHaveBeenCalledWith(
      "Add a location, a meeting link, or both."
    );
  });

  test("shows the unreadable event card when the target event cannot be resolved", () => {
    global.CalendarManager = jest.fn(() => ({
      getEventRobust: jest.fn(() => null),
      processEventBuffer: processEventBufferMock
    }));
    global.UIBuilder = jest.fn(() => ({
      createUnreadableEventCard: jest.fn(() => ({ type: "unreadable" })),
      createSuccessCard: jest.fn(() => ({ type: "success" }))
    }));

    const { handleCreateBuffer } = require("../controller.js");

    handleCreateBuffer({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1"
      },
      calendar: {}
    });

    expect(processEventBufferMock).not.toHaveBeenCalled();
    expect(global.CardService.newNavigation().updateCard).toHaveBeenCalledWith({ type: "unreadable" });
  });

  test("returns all-day, past, skipped, and error responses for single-event buffering edge cases", () => {
    const allDayEvent = {
      getId: jest.fn(() => "all-day"),
      getStartTime: jest.fn(() => new Date("2099-03-18T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2099-03-18T11:00:00Z")),
      isAllDayEvent: jest.fn(() => true)
    };
    const pastEvent = {
      getId: jest.fn(() => "past"),
      getStartTime: jest.fn(() => new Date("2000-03-18T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2000-03-18T11:00:00Z")),
      isAllDayEvent: jest.fn(() => false)
    };
    const futureEvent = {
      getId: jest.fn(() => "future"),
      getStartTime: jest.fn(() => new Date("2099-03-18T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2099-03-18T11:00:00Z")),
      isAllDayEvent: jest.fn(() => false)
    };
    const getEventRobust = jest
      .fn()
      .mockReturnValueOnce(allDayEvent)
      .mockReturnValueOnce(pastEvent)
      .mockReturnValueOnce(futureEvent)
      .mockReturnValueOnce(futureEvent);
    const processEventBuffer = jest
      .fn()
      .mockReturnValueOnce({ skipped: true, wasUpdate: false })
      .mockImplementationOnce(() => {
        throw new Error("boom");
      });

    global.CalendarManager = jest.fn(() => ({
      getEventRobust,
      processEventBuffer
    }));
    global.UIBuilder = jest.fn(() => ({
      createUnreadableEventCard: jest.fn(() => ({ type: "unreadable" })),
      createAllDayEventCard: jest.fn(() => ({ type: "all-day" })),
      createPastEventCard: jest.fn(() => ({ type: "past" })),
      createSuccessCard: jest.fn(() => ({ type: "success" }))
    }));

    const { handleCreateBuffer } = require("../controller.js");

    handleCreateBuffer({
      parameters: { calendarId: "calendar-1", eventId: "all-day" },
      calendar: {}
    });
    expect(global.CardService.newNavigation().updateCard).toHaveBeenCalledWith({ type: "all-day" });

    handleCreateBuffer({
      parameters: { calendarId: "calendar-1", eventId: "past" },
      calendar: {}
    });
    expect(global.CardService.newNavigation().updateCard).toHaveBeenCalledWith({ type: "past" });

    handleCreateBuffer({
      parameters: { calendarId: "calendar-1", eventId: "future" },
      calendar: {}
    });
    expect(global.CardService.newNotification().setText).toHaveBeenCalledWith("Buffer skipped (Online disabled in Settings).");

    handleCreateBuffer({
      parameters: { calendarId: "calendar-1", eventId: "future" },
      calendar: {}
    });
    expect(global.CardService.newNotification().setText).toHaveBeenCalledWith("Headstart couldn't create the buffer for this event.");
  });
});

describe("findEventAndCalendar", () => {
  test("searches other calendars when the initial calendar misses the event", () => {
    const firstCalendar = { getId: jest.fn(() => "calendar-1") };
    const secondCalendar = { getId: jest.fn(() => "calendar-2") };
    const calManager = {
      getEventRobust: jest.fn((calendarId) => {
        if (calendarId === "calendar-2") return { id: "event-1" };
        return null;
      })
    };
    global.CalendarApp.getAllCalendars = jest.fn(() => [firstCalendar, secondCalendar]);

    const { findEventAndCalendar } = require("../controller.js");
    const result = findEventAndCalendar(calManager, "calendar-1", "event-1", {});

    expect(result).toEqual({
      event: { id: "event-1" },
      calId: "calendar-2"
    });
  });
});

describe("onEventOpen", () => {
  beforeEach(() => {
    jest.resetModules();

    const futureStart = new Date("2099-03-19T10:00:00Z");
    const futureEnd = new Date("2099-03-19T11:00:00Z");
    const event = {
      getId: jest.fn(() => "event-1"),
      getTitle: jest.fn(() => "Planning"),
      getStartTime: jest.fn(() => futureStart),
      getEndTime: jest.fn(() => futureEnd),
      isAllDayEvent: jest.fn(() => false)
    };

    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "true" }))
    }));
    global.TravelEngine = jest.fn(() => ({}));
    global.CalendarApp.getAllCalendars = jest.fn(() => []);

    global.CalendarManager = jest.fn(() => ({
      getEventRobust: jest.fn(() => event),
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => null),
      createEventContext: jest.fn(() => ({
        rawLocation: "",
        meetingLink: "",
        nativeConferenceData: null
      }))
    }));

    global.UIBuilder = jest.fn(() => ({
      createUnsavedEventCard: jest.fn(() => ({ type: "unsaved" })),
      createUnreadableEventCard: jest.fn(() => ({ type: "unreadable" })),
      createAllDayEventCard: jest.fn(() => ({ type: "all-day" })),
      createPastEventCard: jest.fn(() => ({ type: "past" })),
      createShadowInfoCard: jest.fn(() => ({ type: "shadow-info" })),
      createManualDetailsCard: jest.fn(() => ({ type: "manual-details" })),
      createDisambiguationCard: jest.fn(() => ({ type: "disambiguation" })),
      createInitialContextCard: jest.fn(() => ({ type: "initial-context" }))
    }));
  });

  test("shows the manual details card when the event has no location or conferencing", () => {
    const { onEventOpen } = require("../controller.js");

    const result = onEventOpen({
      calendar: {
        calendarId: "calendar-1",
        id: "event-1",
        start: { dateTime: "2099-03-19T10:00:00Z" },
        end: { dateTime: "2099-03-19T11:00:00Z" }
      }
    });

    expect(result).toEqual({ type: "manual-details" });
    expect(global.UIBuilder.mock.results[0].value.createManualDetailsCard).toHaveBeenCalledWith(
      "calendar-1",
      "event-1",
      expect.objectContaining({
        eventStart: "2099-03-19T10:00:00.000Z",
        eventEnd: "2099-03-19T11:00:00.000Z"
      }),
      expect.objectContaining({
        isUpdate: false
      })
    );
  });

  test("shows the unreadable event card when the event cannot be resolved", () => {
    global.CalendarManager = jest.fn(() => ({
      getEventRobust: jest.fn(() => null),
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => null),
      createEventContext: jest.fn()
    }));

    const { onEventOpen } = require("../controller.js");
    const result = onEventOpen({
      calendar: {
        calendarId: "calendar-1",
        id: "event-1",
        start: { dateTime: "2099-03-19T10:00:00Z" },
        end: { dateTime: "2099-03-19T11:00:00Z" }
      }
    });

    expect(result).toEqual({ type: "unreadable" });
  });

  test("shows the hybrid disambiguation card for an unbuffered hybrid event", () => {
    global.CalendarManager = jest.fn(() => ({
      getEventRobust: jest.fn(() => ({
        getId: jest.fn(() => "event-1"),
        getTitle: jest.fn(() => "Planning"),
        getStartTime: jest.fn(() => new Date("2099-03-19T10:00:00Z")),
        getEndTime: jest.fn(() => new Date("2099-03-19T11:00:00Z")),
        isAllDayEvent: jest.fn(() => false)
      })),
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => null),
      createEventContext: jest.fn(() => ({
        rawLocation: "Room 101",
        meetingLink: "https://meet.google.com/hybrid-link",
        nativeConferenceData: null
      }))
    }));

    const { onEventOpen } = require("../controller.js");
    const result = onEventOpen({
      calendar: {
        calendarId: "calendar-1",
        id: "event-1",
        start: { dateTime: "2099-03-19T10:00:00Z" },
        end: { dateTime: "2099-03-19T11:00:00Z" }
      }
    });

    expect(result).toEqual({ type: "disambiguation" });
    expect(global.UIBuilder.mock.results[0].value.createDisambiguationCard).toHaveBeenCalledWith(
      "calendar-1",
      "event-1",
      "Room 101",
      "https://meet.google.com/hybrid-link",
      expect.any(Object)
    );
  });

  test("uses capability and conference hints when they are present in the event-open payload", () => {
    global.CalendarManager = jest.fn(() => ({
      getEventRobust: jest.fn(() => ({
        getId: jest.fn(() => "event-1"),
        getTitle: jest.fn(() => "Planning"),
        getStartTime: jest.fn(() => new Date("2099-03-19T10:00:00Z")),
        getEndTime: jest.fn(() => new Date("2099-03-19T11:00:00Z")),
        isAllDayEvent: jest.fn(() => false)
      })),
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => null),
      createEventContext: jest.fn(() => ({
        rawLocation: "Room 101",
        meetingLink: "https://meet.google.com/hybrid-link",
        nativeConferenceData: null
      }))
    }));

    const { onEventOpen } = require("../controller.js");
    expect(onEventOpen({
      calendar: {
        calendarId: "calendar-1",
        id: "event-1",
        conferenceData: { signature: "sig" },
        capabilities: {
          canSeeConferenceData: true,
          canSetConferenceData: true
        },
        start: { dateTime: "2099-03-19T10:00:00Z" },
        end: { dateTime: "2099-03-19T11:00:00Z" }
      }
    })).toEqual({ type: "disambiguation" });
  });

  test("shows the unsaved card when the event-open payload has no calendar id", () => {
    const { onEventOpen } = require("../controller.js");

    const result = onEventOpen({
      calendar: {
        calendarId: "",
        id: ""
      }
    });

    expect(result).toEqual({ type: "unsaved" });
  });

  test("shows the all-day and past-event cards for unsupported events", () => {
    global.CalendarManager = jest
      .fn()
      .mockImplementationOnce(() => ({
        getEventRobust: jest.fn(() => ({
          getId: jest.fn(() => "event-1"),
          getStartTime: jest.fn(() => new Date("2099-03-19T10:00:00Z")),
          getEndTime: jest.fn(() => new Date("2099-03-19T11:00:00Z")),
          isAllDayEvent: jest.fn(() => true)
        })),
        getParentIdFromShadow: jest.fn(() => null),
        findLinkedShadowEvent: jest.fn(() => null),
        createEventContext: jest.fn()
      }))
      .mockImplementationOnce(() => ({
        getEventRobust: jest.fn(() => ({
          getId: jest.fn(() => "event-2"),
          getStartTime: jest.fn(() => new Date("2000-03-19T10:00:00Z")),
          getEndTime: jest.fn(() => new Date("2000-03-19T11:00:00Z")),
          isAllDayEvent: jest.fn(() => false)
        })),
        getParentIdFromShadow: jest.fn(() => null),
        findLinkedShadowEvent: jest.fn(() => null),
        createEventContext: jest.fn()
      }));

    const { onEventOpen } = require("../controller.js");

    expect(onEventOpen({
      calendar: {
        calendarId: "calendar-1",
        id: "event-1",
        start: { dateTime: "2099-03-19T10:00:00Z" },
        end: { dateTime: "2099-03-19T11:00:00Z" }
      }
    })).toEqual({ type: "all-day" });

    expect(onEventOpen({
      calendar: {
        calendarId: "calendar-1",
        id: "event-2",
        start: { dateTime: "2000-03-19T10:00:00Z" },
        end: { dateTime: "2000-03-19T11:00:00Z" }
      }
    })).toEqual({ type: "past" });
  });

  test("shows shadow info when a tapped shadow cannot be resolved back to its parent", () => {
    const shadowEvent = {
      getId: jest.fn(() => "shadow-1"),
      getTitle: jest.fn(() => "Planning"),
      getStartTime: jest.fn(() => new Date("2099-03-19T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2099-03-19T11:00:00Z")),
      isAllDayEvent: jest.fn(() => false)
    };
    const getEventRobust = jest
      .fn()
      .mockReturnValueOnce(shadowEvent)
      .mockReturnValueOnce(null);
    global.CalendarManager = jest.fn(() => ({
      getEventRobust,
      getParentIdFromShadow: jest.fn(() => "parent-1"),
      findLinkedShadowEvent: jest.fn(() => null),
      createEventContext: jest.fn()
    }));

    const { onEventOpen } = require("../controller.js");
    const result = onEventOpen({
      calendar: {
        calendarId: "calendar-1",
        id: "shadow-1",
        start: { dateTime: "2099-03-19T10:00:00Z" },
        end: { dateTime: "2099-03-19T11:00:00Z" }
      }
    });

    expect(result).toEqual({ type: "shadow-info" });
  });

  test("marks existing hybrid buffers as requiring mode selection on refresh", () => {
    const existingShadow = { id: "shadow-1" };
    global.CalendarManager = jest.fn(() => ({
      getEventRobust: jest.fn(() => ({
        getId: jest.fn(() => "event-1"),
        getTitle: jest.fn(() => "Planning"),
        getStartTime: jest.fn(() => new Date("2099-03-19T10:00:00Z")),
        getEndTime: jest.fn(() => new Date("2099-03-19T11:00:00Z")),
        isAllDayEvent: jest.fn(() => false)
      })),
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => existingShadow),
      createEventContext: jest.fn(() => ({
        rawLocation: "Room 101",
        meetingLink: "https://meet.google.com/hybrid-link",
        nativeConferenceData: null
      }))
    }));

    const { onEventOpen } = require("../controller.js");
    const result = onEventOpen({
      calendar: {
        calendarId: "calendar-1",
        id: "event-1",
        start: { dateTime: "2099-03-19T10:00:00Z" },
        end: { dateTime: "2099-03-19T11:00:00Z" }
      }
    });

    expect(result).toEqual({ type: "initial-context" });
    expect(global.UIBuilder.mock.results[0].value.createInitialContextCard).toHaveBeenCalledWith(
      expect.any(Object),
      "calendar-1",
      "event-1",
      existingShadow,
      expect.objectContaining({
        requiresModeSelection: true,
        physicalLocation: "Room 101",
        meetingLink: "https://meet.google.com/hybrid-link"
      })
    );
  });

  test("resolves a tapped shadow back to its parent event before building context", () => {
    const shadowEvent = {
      getId: jest.fn(() => "shadow-1"),
      getTitle: jest.fn(() => "Shadow"),
      getStartTime: jest.fn(() => new Date("2099-03-19T09:45:00Z")),
      getEndTime: jest.fn(() => new Date("2099-03-19T11:00:00Z")),
      isAllDayEvent: jest.fn(() => false)
    };
    const parentEvent = {
      getId: jest.fn(() => "event-1"),
      getTitle: jest.fn(() => "Planning"),
      getStartTime: jest.fn(() => new Date("2099-03-19T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2099-03-19T11:00:00Z")),
      isAllDayEvent: jest.fn(() => false)
    };
    const getEventRobust = jest
      .fn()
      .mockReturnValueOnce(shadowEvent)
      .mockReturnValueOnce(parentEvent);
    const findLinkedShadowEvent = jest.fn(() => null);
    const createEventContext = jest.fn(() => ({
      rawLocation: "Room 101",
      meetingLink: "",
      nativeConferenceData: null
    }));

    global.CalendarManager = jest.fn(() => ({
      getEventRobust,
      getParentIdFromShadow: jest.fn(() => "parent-1"),
      findLinkedShadowEvent,
      createEventContext
    }));

    const { onEventOpen } = require("../controller.js");
    const result = onEventOpen({
      calendar: {
        calendarId: "calendar-1",
        id: "shadow-1",
        start: { dateTime: "2099-03-19T09:45:00Z" },
        end: { dateTime: "2099-03-19T11:00:00Z" }
      }
    });

    expect(result).toEqual({ type: "initial-context" });
    expect(findLinkedShadowEvent).toHaveBeenCalledWith(parentEvent);
    expect(createEventContext).toHaveBeenCalledWith(parentEvent, "calendar-1", {});
  });
});

describe("controller navigation and sync actions", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    const responseBuilder = {
      setNavigation: jest.fn().mockReturnThis(),
      setNotification: jest.fn().mockReturnThis(),
      setStateChanged: jest.fn().mockReturnThis(),
      build: jest.fn(() => ({ ok: true }))
    };
    const navigation = {
      updateCard: jest.fn().mockReturnThis(),
      popCard: jest.fn().mockReturnThis(),
      pushCard: jest.fn().mockReturnThis()
    };
    const notification = {
      setText: jest.fn().mockReturnThis()
    };

    global.CardService = {
      newActionResponseBuilder: jest.fn(() => responseBuilder),
      newNavigation: jest.fn(() => navigation),
      newNotification: jest.fn(() => notification)
    };
  });

  test("onShowBufferModeSelection forwards the current event context into the disambiguation card", () => {
    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "true" }))
    }));
    const createDisambiguationCard = jest.fn(() => ({ type: "disambiguation" }));
    global.UIBuilder = jest.fn(() => ({
      createDisambiguationCard
    }));

    const { onShowBufferModeSelection } = require("../controller.js");
    onShowBufferModeSelection({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1",
        physicalLocation: "Room 101",
        meetingLink: "https://meet.google.com/hybrid-link",
        eventApiId: "api-id",
        recurringEventId: "recurring-id",
        eventStart: "2099-04-17T10:00:00.000Z",
        eventEnd: "2099-04-17T11:00:00.000Z",
        eventConferenceData: "encoded-data",
        eventHangoutLink: "https://meet.google.com/hybrid-link"
      }
    });

    expect(createDisambiguationCard).toHaveBeenCalledWith(
      "calendar-1",
      "event-1",
      "Room 101",
      "https://meet.google.com/hybrid-link",
      expect.objectContaining({
        eventConferenceData: "encoded-data",
        eventHangoutLink: "https://meet.google.com/hybrid-link"
      })
    );
  });

  test("onShowBufferModeSelection falls back to blank optional parameters", () => {
    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "true" }))
    }));
    const createDisambiguationCard = jest.fn(() => ({ type: "disambiguation" }));
    global.UIBuilder = jest.fn(() => ({
      createDisambiguationCard
    }));

    const { onShowBufferModeSelection } = require("../controller.js");
    onShowBufferModeSelection({
      parameters: {
        calendarId: "calendar-1",
        eventId: "event-1"
      }
    });

    expect(createDisambiguationCard).toHaveBeenCalledWith(
      "calendar-1",
      "event-1",
      "",
      "",
      expect.objectContaining({
        eventApiId: "",
        recurringEventId: "",
        eventStart: "",
        eventEnd: "",
        eventConferenceData: "",
        eventHangoutLink: ""
      })
    );
  });

  test("handleBatchSync requires at least one selected calendar", () => {
    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "true" }))
    }));
    global.TravelEngine = jest.fn(() => ({}));
    global.CalendarManager = jest.fn(() => ({}));
    global.SyncEngine = jest.fn(() => ({}));
    global.UIBuilder = jest.fn(() => ({}));

    const { handleBatchSync } = require("../controller.js");
    handleBatchSync({ formInput: {} });

    expect(global.CardService.newNotification().setText).toHaveBeenCalledWith("Please select a calendar.");
  });

  test("handleBatchSync saves state, installs the trigger, runs sync, and returns the success card", () => {
    const saveSyncState = jest.fn();
    const saveSyncStatus = jest.fn();
    const batchCard = { type: "batch-success" };
    const runSyncEngine = jest.fn(() => ({ processed: 2, skipped: 1, errors: 0 }));
    const installDailyTrigger = jest.fn();

    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "true" })),
      saveSyncState,
      saveSyncStatus
    }));
    global.TravelEngine = jest.fn(() => ({}));
    global.CalendarManager = jest.fn(() => ({}));
    global.SyncEngine = jest.fn(() => ({
      runSyncEngine,
      installDailyTrigger
    }));
    global.UIBuilder = jest.fn(() => ({
      createBatchSuccessCard: jest.fn(() => batchCard)
    }));

    const { handleBatchSync } = require("../controller.js");
    const result = handleBatchSync({
      formInput: {
        selectedCalendars: "calendar-1"
      }
    });

    expect(saveSyncState).toHaveBeenCalledWith(["calendar-1"]);
    expect(installDailyTrigger).toHaveBeenCalled();
    expect(runSyncEngine).toHaveBeenCalledWith(["calendar-1"]);
    expect(saveSyncStatus).toHaveBeenCalledWith({ processed: 2, skipped: 1, errors: 0 });
    expect(result).toBe(batchCard);
  });

  test("handleBatchSync preserves an existing calendar selection array", () => {
    const saveSyncState = jest.fn();
    const saveSyncStatus = jest.fn();
    const runSyncEngine = jest.fn(() => ({ processed: 1, skipped: 0, errors: 0 }));

    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "true" })),
      saveSyncState,
      saveSyncStatus
    }));
    global.TravelEngine = jest.fn(() => ({}));
    global.CalendarManager = jest.fn(() => ({}));
    global.SyncEngine = jest.fn(() => ({
      runSyncEngine,
      installDailyTrigger: jest.fn()
    }));
    global.UIBuilder = jest.fn(() => ({
      createBatchSuccessCard: jest.fn(() => ({ type: "batch-success" }))
    }));

    const { handleBatchSync } = require("../controller.js");
    handleBatchSync({
      formInput: {
        selectedCalendars: ["calendar-1", "calendar-2"]
      }
    });

    expect(saveSyncState).toHaveBeenCalledWith(["calendar-1", "calendar-2"]);
    expect(runSyncEngine).toHaveBeenCalledWith(["calendar-1", "calendar-2"]);
  });

  test("runBackgroundSync wires the sync engine and invokes it", () => {
    const runBackgroundSyncMock = jest.fn();
    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "true" }))
    }));
    global.TravelEngine = jest.fn(() => ({}));
    global.CalendarManager = jest.fn(() => ({}));
    global.SyncEngine = jest.fn(() => ({
      runBackgroundSync: runBackgroundSyncMock
    }));

    const { runBackgroundSync } = require("../controller.js");
    runBackgroundSync();

    expect(runBackgroundSyncMock).toHaveBeenCalled();
  });

  test("handleFinishOnboarding marks onboarding complete and returns the dashboard card", () => {
    const setTutorialComplete = jest.fn();
    const appSettingsInstance = {
      get: jest.fn(() => ({ bufferOnline: "true" })),
      setTutorialComplete
    };
    global.AppSettings = jest.fn(() => appSettingsInstance);
    global.UIBuilder = jest.fn(() => ({
      createDashboardCard: jest.fn(() => ({ type: "dashboard" }))
    }));

    const { handleFinishOnboarding } = require("../controller.js");
    handleFinishOnboarding({});

    expect(setTutorialComplete).toHaveBeenCalled();
    expect(global.CardService.newNavigation().updateCard).toHaveBeenCalledWith({ type: "dashboard" });
  });

  test("navigation helpers persist checkbox state before pushing cards", () => {
    const saveCheckboxState = jest.fn();
    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "true" })),
      saveCheckboxState
    }));
    global.UIBuilder = jest.fn(() => ({
      createSettingsCard: jest.fn(() => ({ type: "settings" })),
      createOnboardingCard: jest.fn(() => ({ type: "tutorial" }))
    }));

    const { onNavigateToSettings, onNavigateToTutorial } = require("../controller.js");
    onNavigateToSettings({ formInput: { selectedCalendars: ["calendar-1"] } });
    onNavigateToTutorial({ formInput: { selectedCalendars: ["calendar-2"] } });

    expect(saveCheckboxState).toHaveBeenNthCalledWith(1, ["calendar-1"]);
    expect(saveCheckboxState).toHaveBeenNthCalledWith(2, ["calendar-2"]);
    expect(global.CardService.newNavigation().pushCard).toHaveBeenCalledWith({ type: "settings" });
    expect(global.CardService.newNavigation().pushCard).toHaveBeenCalledWith({ type: "tutorial" });
  });

  test("navigation helpers fall back to an empty checkbox state when no form input is provided", () => {
    const saveCheckboxState = jest.fn();
    global.AppSettings = jest.fn(() => ({
      get: jest.fn(() => ({ bufferOnline: "true" })),
      saveCheckboxState
    }));
    global.UIBuilder = jest.fn(() => ({
      createSettingsCard: jest.fn(() => ({ type: "settings" })),
      createOnboardingCard: jest.fn(() => ({ type: "tutorial" }))
    }));

    const { onNavigateToSettings, onNavigateToTutorial } = require("../controller.js");
    onNavigateToSettings({});
    onNavigateToTutorial({});

    expect(saveCheckboxState).toHaveBeenNthCalledWith(1, []);
    expect(saveCheckboxState).toHaveBeenNthCalledWith(2, []);
  });

  test("handleSaveSettings persists settings, ensures the Headstart calendar exists, and pops the card", () => {
    const save = jest.fn();
    const get = jest.fn(() => ({ bufferOnline: "true" }));
    const getOrCreateHeadstartCalendar = jest.fn();

    global.AppSettings = jest.fn(() => ({
      save,
      get
    }));
    global.CalendarManager = jest.fn(() => ({
      getOrCreateHeadstartCalendar
    }));

    const { handleSaveSettings } = require("../controller.js");
    handleSaveSettings({
      formInput: {
        setting_home: "New address"
      }
    });

    expect(save).toHaveBeenCalledWith({ setting_home: "New address" });
    expect(getOrCreateHeadstartCalendar).toHaveBeenCalled();
    expect(global.CardService.newNotification().setText).toHaveBeenCalledWith("Settings Saved");
    expect(global.CardService.newNavigation().popCard).toHaveBeenCalled();
  });
});
