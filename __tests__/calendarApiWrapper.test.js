const { CalendarManager } = require("../calendarApiWrapper.js");

describe("CalendarManager shadow description", () => {
  let calendarManager;

  beforeEach(() => {
    calendarManager = new CalendarManager({}, null);
  });

  test("keeps the shadow description high-level while preserving useful context", () => {
    jest.clearAllMocks();
    const description = calendarManager.buildShadowDescription(
      "https://meet.google.com/example",
      "Bring the draft agenda.",
      "",
      new Date("2026-03-24T10:00:00Z")
    );

    expect(description).toContain("This event was created by Headstart to protect the time before your linked event.");
    expect(description).toContain("Meeting Link");
    expect(description).toContain("Original Event Notes");
    expect(description).toContain("Original Start Time");
    expect(description).toContain("24 Mar 2026");
    expect(description).toContain("10:00");
    expect(description).not.toContain("<b>");
    expect(description).not.toContain("<br>");
    expect(global.Utilities.formatDate).toHaveBeenCalled();
  });

  test("omits empty original notes", () => {
    const description = calendarManager.buildShadowDescription("", "", "", null);

    expect(description).not.toContain("Original Event Notes");
    expect(description).not.toContain("Original Start Time");
  });
});

describe("CalendarManager linked shadow lookup", () => {
  beforeEach(() => {
    global.CONFIG = {
      CALENDAR_NAME: "Headstart",
      TAG_PARENT_ID: "HEADSTART_PARENT_ID",
      TAG_PARENT_CAL_ID: "HEADSTART_PARENT_CAL_ID",
      TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
      TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
      TAG_BUFFER_MINUTES: "HEADSTART_BUFFER_MINUTES"
    };
  });

  test("does not match an unrelated untagged shadow event by title and time alone", () => {
    const originalEvent = {
      getId: jest.fn(() => "parent-1"),
      getTitle: jest.fn(() => "Consultation"),
      getStartTime: jest.fn(() => new Date("2026-03-18T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00Z"))
    };
    const unrelatedShadow = {
      getTag: jest.fn(() => null),
      getStartTime: jest.fn(() => new Date("2026-03-18T09:30:00Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00Z")),
      getTitle: jest.fn(() => "Consultation"),
      getDescription: jest.fn(() => "🛡️ <b>Headstart Buffer</b>")
    };
    const headstartCalendar = {
      getName: jest.fn(() => "Headstart"),
      getId: jest.fn(() => "headstart-cal"),
      setColor: jest.fn(),
      getEvents: jest.fn(() => [unrelatedShadow])
    };

    global.CalendarApp.getAllCalendars = jest.fn(() => [headstartCalendar]);
    global.CalendarApp.getCalendarById = jest.fn();

    const manager = new CalendarManager({ calColor: "10" }, null, {
      eventContextFactory: { createFromEvent: jest.fn() },
      shadowDescriptionBuilder: { build: jest.fn() },
      bufferDecisionService: { decide: jest.fn() }
    });

    expect(manager.findLinkedShadowEvent(originalEvent)).toBeNull();
  });
});

describe("CalendarManager event resolution and conference sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.CONFIG = {
      CALENDAR_NAME: "Headstart",
      TAG_PARENT_ID: "HEADSTART_PARENT_ID",
      TAG_PARENT_CAL_ID: "HEADSTART_PARENT_CAL_ID",
      TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
      TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
      TAG_BUFFER_MINUTES: "HEADSTART_BUFFER_MINUTES",
      TAG_CONFERENCE_FINGERPRINT: "HEADSTART_CONFERENCE_FINGERPRINT"
    };
  });

  test("resolves the exact tapped instance using advanced-event lookup hints", () => {
    const targetStart = new Date("2026-03-18T10:00:00Z");
    const targetEnd = new Date("2026-03-18T11:00:00Z");
    const recurringInstance = {
      getId: jest.fn(() => "ical-uid@example.com"),
      getStartTime: jest.fn(() => targetStart),
      getEndTime: jest.fn(() => targetEnd),
      getTitle: jest.fn(() => "Seminar")
    };
    const calendar = {
      getEventById: jest.fn(() => null),
      getEventSeriesById: jest.fn(() => null),
      getEvents: jest.fn(() => [recurringInstance])
    };

    global.CalendarApp.getCalendarById = jest.fn(() => calendar);

    const manager = new CalendarManager({ calColor: "10" }, null, {
      conferenceDetailsService: {
        findAdvancedEvent: jest.fn(() => ({
          id: "api-instance-id",
          iCalUID: "ical-uid@example.com",
          summary: "Seminar",
          start: { dateTime: "2026-03-18T10:00:00.000Z" },
          end: { dateTime: "2026-03-18T11:00:00.000Z" }
        }))
      },
      eventContextFactory: { createFromEvent: jest.fn() },
      shadowDescriptionBuilder: { build: jest.fn() },
      bufferDecisionService: { decide: jest.fn() }
    });

    const resolved = manager.getEventRobust("calendar-1", "api-instance-id", {
      apiEventId: "api-instance-id",
      startTime: targetStart,
      endTime: targetEnd
    });

    expect(resolved).toBe(recurringInstance);
  });

  test("copies native conference data to the buffered shadow event and stores its fingerprint", () => {
    const originalStart = new Date("2026-03-18T10:00:00Z");
    const originalEnd = new Date("2026-03-18T11:00:00Z");
    const tags = {};
    const originalEvent = {
      getId: jest.fn(() => "source-ical@example.com"),
      getTitle: jest.fn(() => "Seminar"),
      getStartTime: jest.fn(() => originalStart),
      getEndTime: jest.fn(() => originalEnd),
      removeAllReminders: jest.fn()
    };
    const shadowEvent = {
      getId: jest.fn(() => "shadow-ical@example.com"),
      getStartTime: jest.fn(() => new Date("2026-03-18T09:45:00Z")),
      getEndTime: jest.fn(() => originalEnd),
      setTag: jest.fn((key, value) => { tags[key] = value; })
    };
    const targetCalendar = {
      getName: jest.fn(() => "Headstart"),
      getId: jest.fn(() => "headstart-cal"),
      setColor: jest.fn(),
      getEvents: jest.fn(() => []),
      createEvent: jest.fn(() => shadowEvent),
      getEventById: jest.fn((id) => {
        if (id === "shadow-ical@example.com") return shadowEvent;
        return null;
      }),
      getEventSeriesById: jest.fn(() => null)
    };

    global.CalendarApp.getAllCalendars = jest.fn(() => [targetCalendar]);
    global.CalendarApp.getCalendarById = jest.fn(() => targetCalendar);
    global.Calendar.Events.get.mockReturnValue({
      conferenceData: {
        signature: "native-signature",
        conferenceSolution: { key: { type: "hangoutsMeet" } },
        entryPoints: [
          { entryPointType: "video", uri: "https://meet.google.com/native-link" }
        ]
      }
    });

    const manager = new CalendarManager({ calColor: "10" }, null, {
      conferenceDetailsService: {
        findAdvancedEvent: jest.fn((calendarId, lookup) => {
          if (lookup.iCalUID === "shadow-ical@example.com") {
            return { id: "shadow-api-id", conferenceData: null };
          }
          return null;
        })
      },
      eventContextFactory: {
        createFromEvent: jest.fn(() => ({
          meetingLink: "https://meet.google.com/native-link",
          rawDescription: "Bring notes.",
          conferenceDetailsHtml: "Video",
          nativeConferenceData: {
            signature: "native-signature",
            conferenceSolution: { key: { type: "hangoutsMeet" } },
            entryPoints: [
              { entryPointType: "video", uri: "https://meet.google.com/native-link" }
            ]
          },
          hasNativeConferenceData: true,
          conferenceFingerprint: "native-fingerprint",
          shadowLocation: ""
        }))
      },
      shadowDescriptionBuilder: { build: jest.fn(() => "shadow-description") },
      bufferDecisionService: { decide: jest.fn(() => ({ skipped: false, minutes: 15, finalLocation: "" })) }
    });

    const result = manager.processEventBuffer(originalEvent, "AUTO", "calendar-1", {
      eventStart: "2026-03-18T10:00:00.000Z",
      eventEnd: "2026-03-18T11:00:00.000Z"
    });

    expect(global.Calendar.Events.patch).toHaveBeenCalledWith(
      {
        conferenceData: {
          signature: "native-signature",
          conferenceSolution: { key: { type: "hangoutsMeet" } },
          entryPoints: [
            { entryPointType: "video", uri: "https://meet.google.com/native-link" }
          ]
        }
      },
      "headstart-cal",
      "shadow-api-id",
      expect.objectContaining({
        conferenceDataVersion: 1
      })
    );
    expect(global.Calendar.Events.patch).toHaveBeenCalledWith(
      {
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 0 }
          ]
        }
      },
      "headstart-cal",
      "shadow-api-id",
      expect.objectContaining({
        sendUpdates: "none"
      })
    );
    expect(tags[global.CONFIG.TAG_CONFERENCE_FINGERPRINT]).toBe("native-fingerprint");
    expect(result.wasUpdate).toBe(false);
  });

  test("does not attempt native conference copy when the source conference has no signature", () => {
    const originalStart = new Date("2026-03-18T10:00:00Z");
    const originalEnd = new Date("2026-03-18T11:00:00Z");
    const tags = {};
    const originalEvent = {
      getId: jest.fn(() => "source-ical@example.com"),
      getTitle: jest.fn(() => "Seminar"),
      getStartTime: jest.fn(() => originalStart),
      getEndTime: jest.fn(() => originalEnd),
      removeAllReminders: jest.fn()
    };
    const shadowEvent = {
      getId: jest.fn(() => "shadow-ical@example.com"),
      getStartTime: jest.fn(() => new Date("2026-03-18T09:45:00Z")),
      getEndTime: jest.fn(() => originalEnd),
      setTag: jest.fn((key, value) => { tags[key] = value; })
    };
    const targetCalendar = {
      getName: jest.fn(() => "Headstart"),
      getId: jest.fn(() => "headstart-cal"),
      setColor: jest.fn(),
      getEvents: jest.fn(() => []),
      createEvent: jest.fn(() => shadowEvent),
      getEventById: jest.fn((id) => {
        if (id === "shadow-ical@example.com") return shadowEvent;
        return null;
      }),
      getEventSeriesById: jest.fn(() => null)
    };

    global.CalendarApp.getAllCalendars = jest.fn(() => [targetCalendar]);
    global.CalendarApp.getCalendarById = jest.fn(() => targetCalendar);

    const manager = new CalendarManager({ calColor: "10" }, null, {
      conferenceDetailsService: {
        findAdvancedEvent: jest.fn((calendarId, lookup) => {
          if (lookup.iCalUID === "shadow-ical@example.com") {
            return { id: "shadow-api-id", conferenceData: null };
          }
          return null;
        })
      },
      eventContextFactory: {
        createFromEvent: jest.fn(() => ({
          meetingLink: "https://meet.google.com/native-link",
          rawDescription: "Bring notes.",
          conferenceDetailsHtml: "Video",
          nativeConferenceData: {
            conferenceSolution: { key: { type: "hangoutsMeet" } },
            entryPoints: [
              { entryPointType: "video", uri: "https://meet.google.com/native-link" }
            ]
          },
          hasNativeConferenceData: true,
          conferenceFingerprint: "native-fingerprint",
          shadowLocation: ""
        }))
      },
      shadowDescriptionBuilder: { build: jest.fn(() => "shadow-description") },
      bufferDecisionService: { decide: jest.fn(() => ({ skipped: false, minutes: 15, finalLocation: "" })) }
    });

    manager.processEventBuffer(originalEvent, "AUTO", "calendar-1", {
      eventStart: "2026-03-18T10:00:00.000Z",
      eventEnd: "2026-03-18T11:00:00.000Z"
    });

    expect(global.Calendar.Events.patch).toHaveBeenCalledWith(
      {
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 0 }
          ]
        }
      },
      "headstart-cal",
      "shadow-api-id",
      expect.objectContaining({
        sendUpdates: "none"
      })
    );
    expect(tags[global.CONFIG.TAG_CONFERENCE_FINGERPRINT]).toBe("native-fingerprint");
  });
});

describe("CalendarManager helper coverage", () => {
  const baseConfig = {
    CALENDAR_NAME: "Headstart",
    TAG_PARENT_ID: "HEADSTART_PARENT_ID",
    TAG_PARENT_CAL_ID: "HEADSTART_PARENT_CAL_ID",
    TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
    TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
    TAG_BUFFER_MINUTES: "HEADSTART_BUFFER_MINUTES",
    TAG_CONFERENCE_FINGERPRINT: "HEADSTART_CONFERENCE_FINGERPRINT"
  };

  function createManager(overrides) {
    const services = Object.assign({
      conferenceDetailsService: { findAdvancedEvent: jest.fn(() => null) },
      eventContextFactory: { createFromEvent: jest.fn(() => ({})) },
      shadowDescriptionBuilder: { build: jest.fn(() => "shadow-description") },
      bufferDecisionService: { decide: jest.fn(() => ({ skipped: false, minutes: 15, finalLocation: "" })) }
    }, overrides || {});

    return new CalendarManager({ calColor: "10" }, null, services);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    global.CONFIG = baseConfig;
  });

  test("_normalizeTimeHint() and _decodeSerializedJson() cover object, fallback, and invalid cases", () => {
    const manager = createManager();

    expect(manager._normalizeTimeHint({})).toBeNull();
    expect(manager._normalizeTimeHint({ date: "2026-03-18" })).toBeInstanceOf(Date);

    expect(manager._decodeSerializedJson({ ok: true })).toEqual({ ok: true });
    expect(manager._decodeSerializedJson(global.Utilities.base64Encode(JSON.stringify({ ok: "base64" })))).toEqual({ ok: "base64" });

    const originalDecode = global.Utilities.base64Decode;
    global.Utilities.base64Decode = jest.fn(() => {
      throw new Error("bad base64");
    });
    expect(manager._decodeSerializedJson(JSON.stringify({ ok: true }))).toEqual({ ok: true });
    expect(manager._decodeSerializedJson("not-json")).toBeNull();
    global.Utilities.base64Decode = originalDecode;
  });

  test("_findEventByWindow(), _findBuiltInEventFromAdvancedEvent(), and _resolveEventFromAdvancedLookup() use time-aware fallbacks", () => {
    const manager = createManager({
      conferenceDetailsService: {
        findAdvancedEvent: jest.fn(() => ({
          iCalUID: "ical@example.com",
          summary: "Seminar",
          start: { dateTime: "2026-03-18T10:00:00.000Z" },
          end: { dateTime: "2026-03-18T11:00:00.000Z" }
        }))
      }
    });
    const matchedEvent = {
      getId: jest.fn(() => "candidate-1"),
      getTitle: jest.fn(() => "Seminar"),
      getStartTime: jest.fn(() => new Date("2026-03-18T10:00:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00.000Z"))
    };
    const windowMiss = {
      getId: jest.fn(() => "different-id"),
      getTitle: jest.fn(() => "Seminar"),
      getStartTime: jest.fn(() => new Date("2026-03-18T10:00:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00.000Z"))
    };
    const mismatchedDirect = {
      getStartTime: jest.fn(() => new Date("2026-03-18T09:00:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T10:00:00.000Z"))
    };
    const calendar = {
      getEvents: jest
        .fn()
        .mockReturnValueOnce([windowMiss])
        .mockReturnValueOnce([matchedEvent])
        .mockReturnValueOnce([windowMiss])
        .mockReturnValueOnce([matchedEvent]),
      getEventById: jest.fn(() => mismatchedDirect)
    };

    global.CalendarApp.getCalendarById = jest.fn(() => calendar);

    expect(manager._findEventByWindow(calendar, "candidate-1", {
      startTime: new Date("2026-03-18T10:00:00.000Z"),
      endTime: new Date("2026-03-18T11:00:00.000Z")
    })).toBeNull();

    expect(() => manager._findBuiltInEventFromAdvancedEvent(calendar, {
      iCalUID: "ical@example.com",
      summary: "Seminar",
      start: { dateTime: "2026-03-18T10:00:00.000Z" },
      end: { dateTime: "2026-03-18T11:00:00.000Z" }
    })).not.toThrow();

    expect(() => manager._resolveEventFromAdvancedLookup("calendar-1", "api-1", {
      apiEventId: "api-1",
      iCalUID: "ical@example.com",
      startTime: new Date("2026-03-18T10:00:00.000Z"),
      endTime: new Date("2026-03-18T11:00:00.000Z")
    })).not.toThrow();
  });

  test("getEventRobust() covers null calendars, base64 ids, series fallback, and final search window matching", () => {
    const manager = createManager();
    const targetEvent = {
      getId: jest.fn(() => "decoded-id"),
      getStartTime: jest.fn(() => new Date("2026-03-18T10:00:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00.000Z"))
    };
    const series = { kind: "series" };
    const finalScanEvent = {
      getId: jest.fn(() => "partial-event-id-extra"),
      getStartTime: jest.fn(() => new Date("2026-03-18T10:00:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00.000Z"))
    };
    const encodedId = global.Utilities.base64Encode("decoded-id");
    const calendar = {
      getEvents: jest.fn(() => [finalScanEvent]),
      getEventById: jest.fn((id) => {
        if (id === "decoded-id") return targetEvent;
        return null;
      }),
      getEventSeriesById: jest.fn(() => series)
    };

    global.CalendarApp.getCalendarById = jest
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(calendar)
      .mockReturnValueOnce(calendar)
      .mockReturnValueOnce(calendar);

    expect(manager.getEventRobust("calendar-0", "missing", {})).toBeNull();
    expect(manager.getEventRobust("calendar-1", encodedId, {
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    })).toBe(targetEvent);
    expect(manager.getEventRobust("calendar-1", "series-id", {})).toBe(series);
    expect(manager.getEventRobust("calendar-1", "partial-event-id", {
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    })).toBe(finalScanEvent);
  });

  test("getEventRobust() returns null when every lookup strategy fails", () => {
    const manager = createManager();
    const calendar = {
      getEvents: jest.fn(() => []),
      getEventById: jest.fn(() => null),
      getEventSeriesById: jest.fn(() => null)
    };

    global.CalendarApp.getCalendarById = jest.fn(() => calendar);

    expect(manager.getEventRobust("calendar-1", "missing", {
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    })).toBeNull();
  });

  test("getOrCreateHeadstartCalendar() reuses an existing Headstart calendar", () => {
    const existing = {
      getName: jest.fn(() => "Headstart"),
      getId: jest.fn(() => "existing-cal"),
      setColor: jest.fn()
    };
    global.CalendarApp.getAllCalendars = jest.fn(() => [existing]);

    const manager = createManager();

    expect(manager.getOrCreateHeadstartCalendar()).toBe(existing);
    expect(existing.setColor).toHaveBeenCalledWith("10");
  });

  test("getOrCreateHeadstartCalendar() creates and reveals the Headstart calendar when it does not exist", () => {
    const newCal = {
      getId: jest.fn(() => "new-cal"),
      setColor: jest.fn()
    };
    global.CalendarApp.getAllCalendars = jest.fn(() => []);
    global.CalendarApp.createCalendar = jest.fn(() => newCal);

    const manager = createManager();
    const calendar = manager.getOrCreateHeadstartCalendar();

    expect(calendar).toBe(newCal);
    expect(global.CalendarApp.createCalendar).toHaveBeenCalledWith("Headstart");
    expect(global.Calendar.CalendarList.patch).toHaveBeenCalledWith({
      selected: true,
      hidden: false
    }, "new-cal");
  });

  test("ensureHeadstartCalendarVisible() safely skips blank ids and swallows patch errors", () => {
    const manager = createManager();

    manager.ensureHeadstartCalendarVisible("");
    expect(global.Calendar.CalendarList.patch).not.toHaveBeenCalled();

    global.Calendar.CalendarList.patch.mockImplementationOnce(() => {
      throw new Error("patch failed");
    });
    expect(() => manager.ensureHeadstartCalendarVisible("calendar-1")).not.toThrow();
  });

  test("_findShadowEventResource() retries before giving up or succeeding", () => {
    const manager = createManager({
      conferenceDetailsService: {
        findAdvancedEvent: jest
          .fn()
          .mockReturnValueOnce(null)
          .mockReturnValueOnce({})
          .mockReturnValueOnce({ id: "shadow-api-id" })
      }
    });
    const shadowEvent = {
      getId: jest.fn(() => "shadow-1"),
      getStartTime: jest.fn(() => new Date("2026-03-18T09:45:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00.000Z"))
    };

    expect(manager._findShadowEventResource("calendar-1", shadowEvent)).toEqual({ id: "shadow-api-id" });
    expect(global.Utilities.sleep).toHaveBeenCalledTimes(2);
  });

  test("_findShadowEventResource() returns null after exhausting retries", () => {
    const manager = createManager({
      conferenceDetailsService: {
        findAdvancedEvent: jest.fn(() => null)
      }
    });
    const shadowEvent = {
      getId: jest.fn(() => "shadow-1"),
      getStartTime: jest.fn(() => new Date("2026-03-18T09:45:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00.000Z"))
    };

    expect(manager._findShadowEventResource("calendar-1", shadowEvent)).toBeNull();
  });

  test("_synchronizeShadowConferenceData() handles missing resources and no-native-data cases", () => {
    const manager = createManager();
    manager._findShadowEventResource = jest.fn(() => null);

    expect(manager._synchronizeShadowConferenceData("", null, {
      conferenceFingerprint: "fp",
      hasNativeConferenceData: false
    })).toBe("fp");

    expect(manager._synchronizeShadowConferenceData("calendar-1", { id: "shadow" }, {
      conferenceFingerprint: "fp",
      hasNativeConferenceData: true,
      nativeConferenceData: { signature: "sig" }
    })).toBeUndefined();

    manager._findShadowEventResource = jest.fn(() => ({ id: "shadow-api-id", conferenceData: null }));
    expect(manager._synchronizeShadowConferenceData("calendar-1", { id: "shadow" }, {
      conferenceFingerprint: "fp",
      hasNativeConferenceData: false,
      nativeConferenceData: null
    })).toBe("fp");
  });

  test("_synchronizeShadowConferenceData() handles verification misses and patch failures", () => {
    const manager = createManager();
    manager._findShadowEventResource = jest
      .fn()
      .mockReturnValueOnce({ id: "shadow-api-id", conferenceData: null })
      .mockReturnValueOnce({ id: "shadow-api-id", conferenceData: { signature: "existing" } });

    global.Calendar.Events.get.mockImplementationOnce(() => {
      throw new Error("read failed");
    });

    expect(manager._synchronizeShadowConferenceData("calendar-1", { id: "shadow" }, {
      conferenceFingerprint: "fp",
      hasNativeConferenceData: true,
      nativeConferenceData: {
        signature: "sig",
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/test" }]
      },
      meetingLink: "https://meet.google.com/test"
    })).toBe("fp");

    global.Calendar.Events.patch.mockImplementationOnce(() => {
      throw new Error("patch failed");
    });

    expect(manager._synchronizeShadowConferenceData("calendar-1", { id: "shadow" }, {
      conferenceFingerprint: "fp",
      hasNativeConferenceData: true,
      nativeConferenceData: {
        signature: "sig",
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/test" }]
      },
      meetingLink: "https://meet.google.com/test"
    })).toBeUndefined();
  });

  test("_getShadowReminderMinutes() and _applyShadowReminderPolicy() cover explicit, blank, and fallback reminder cases", () => {
    const manager = createManager();
    manager.settings.bufferReminderMinutes = "5";
    manager._findShadowEventResource = jest.fn(() => ({ id: "shadow-api-id" }));
    const shadowEvent = {
      removeAllReminders: jest.fn(),
      addPopupReminder: jest.fn()
    };

    expect(manager._getShadowReminderMinutes()).toBe(5);
    manager._applyShadowReminderPolicy("calendar-1", shadowEvent);
    expect(shadowEvent.addPopupReminder).toHaveBeenCalledWith(5);
    expect(global.Calendar.Events.patch).not.toHaveBeenCalled();

    jest.clearAllMocks();
    manager.settings.bufferReminderMinutes = "";
    manager._applyShadowReminderPolicy("calendar-1", shadowEvent);
    expect(global.Calendar.Events.patch).toHaveBeenCalledWith(
      {
        reminders: {
          useDefault: false,
          overrides: []
        }
      },
      "calendar-1",
      "shadow-api-id",
      expect.objectContaining({
        sendUpdates: "none"
      })
    );

    jest.clearAllMocks();
    manager.settings.bufferReminderMinutes = "5";
    manager._findShadowEventResource = jest.fn(() => null);
    manager._applyShadowReminderPolicy("calendar-1", shadowEvent);
    expect(shadowEvent.addPopupReminder).toHaveBeenCalledWith(5);

    jest.clearAllMocks();
    shadowEvent.addPopupReminder.mockImplementationOnce(() => {
      throw new Error("native popup failed");
    });
    manager._findShadowEventResource = jest.fn(() => ({ id: "shadow-api-id" }));
    manager._applyShadowReminderPolicy("calendar-1", shadowEvent);
    expect(shadowEvent.addPopupReminder).toHaveBeenCalledWith(5);
    expect(global.Calendar.Events.patch).toHaveBeenCalledWith(
      {
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 5 }
          ]
        }
      },
      "calendar-1",
      "shadow-api-id",
      expect.objectContaining({
        sendUpdates: "none"
      })
    );

    jest.clearAllMocks();
    global.Calendar.Events.patch.mockImplementationOnce(() => {
      throw new Error("reminder patch failed");
    });
    manager._findShadowEventResource = jest.fn(() => null);
    shadowEvent.addPopupReminder.mockImplementationOnce(() => {
      throw new Error("popup failed");
    });
    manager._applyShadowReminderPolicy("calendar-1", shadowEvent);
    expect(shadowEvent.addPopupReminder).toHaveBeenCalledWith(5);

    jest.clearAllMocks();
    manager.settings.bufferReminderMinutes = "0";
    manager._findShadowEventResource = jest.fn(() => ({ id: "shadow-api-id" }));
    global.Calendar.Events.get.mockReturnValueOnce({
      reminders: {
        overrides: [{ method: "popup", minutes: 0 }]
      }
    });
    manager._applyShadowReminderPolicy("calendar-1", shadowEvent);
    expect(global.Calendar.Events.patch).toHaveBeenCalledWith(
      {
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 0 }
          ]
        }
      },
      "calendar-1",
      "shadow-api-id",
      expect.objectContaining({
        sendUpdates: "none"
      })
    );

    jest.clearAllMocks();
    manager.settings.bufferReminderMinutes = "";
    manager._findShadowEventResource = jest.fn(() => null);
    manager._applyShadowReminderPolicy("calendar-1", shadowEvent);
    expect(shadowEvent.addPopupReminder).not.toHaveBeenCalled();

    expect(manager._getShadowReminderMinutes.call({ settings: {} })).toBe(0);
    expect(manager._getShadowReminderMinutes.call({ settings: { bufferReminderMinutes: null } })).toBe(0);
  });

  test("_findShadowEventResource() falls back to an event list lookup when the iCalUID lookup misses", () => {
    const manager = createManager();
    manager.conferenceDetailsService.findAdvancedEvent = jest.fn(() => null);
    global.Calendar.Events.list.mockReturnValueOnce({
      items: [
        {
          id: "shadow-api-id",
          summary: "Planning",
          start: { dateTime: "2026-03-18T09:45:00.000Z" },
          end: { dateTime: "2026-03-18T11:00:00.000Z" }
        }
      ]
    });

    const shadowResource = manager._findShadowEventResource("calendar-1", {
      getId: jest.fn(() => "shadow-ical@example.com"),
      getTitle: jest.fn(() => "Planning"),
      getStartTime: jest.fn(() => new Date("2026-03-18T09:45:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00.000Z"))
    });

    expect(shadowResource).toEqual(expect.objectContaining({ id: "shadow-api-id" }));
    expect(global.Calendar.Events.list).toHaveBeenCalledWith(
      "calendar-1",
      expect.objectContaining({
        singleEvents: true,
        conferenceDataVersion: 1
      })
    );
  });

  test("linkShadowEvent(), getParentIdFromShadow(), and findLinkedShadowEvent() preserve sidecar metadata", () => {
    const tags = {};
    const shadowEvent = {
      setTag: jest.fn((key, value) => {
        tags[key] = value;
      }),
      getTag: jest.fn((key) => {
        if (key === "HEADSTART_UNIVERSAL_ID") return "other";
        if (key === "HEADSTART_PARENT_ID") return "parent-1";
        return tags[key] || null;
      })
    };
    const originalEvent = {
      getId: jest.fn(() => "parent-1"),
      getTitle: jest.fn(() => "Planning"),
      getStartTime: jest.fn(() => new Date("2026-03-18T10:00:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00.000Z"))
    };
    const targetCal = {
      getEvents: jest.fn(() => [shadowEvent])
    };
    const manager = createManager();
    manager.getOrCreateHeadstartCalendar = jest.fn(() => targetCal);

    manager.linkShadowEvent(originalEvent, shadowEvent, "calendar-1", {
      minutes: 15,
      conferenceFingerprint: "fp"
    });

    expect(tags.HEADSTART_PARENT_CAL_ID).toBe("calendar-1");
    expect(tags.HEADSTART_BUFFER_MINUTES).toBe("15");
    expect(manager.findLinkedShadowEvent(originalEvent)).toBe(shadowEvent);

    expect(manager.getParentIdFromShadow({
      getTag: jest.fn(() => {
        throw new Error("bad tag");
      })
    })).toBeNull();
  });

  test("processEventBuffer() deletes skipped shadows, updates existing ones, and surfaces save verification failures", () => {
    const originalEvent = {
      getId: jest.fn(() => "parent-1"),
      getTitle: jest.fn(() => "Planning"),
      getStartTime: jest.fn(() => new Date("2026-03-18T10:00:00.000Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00.000Z")),
      removeAllReminders: jest.fn(() => {
        throw new Error("ignore reminders");
      })
    };
    const deletableShadow = {
      deleteEvent: jest.fn()
    };
    const manager = createManager({
      eventContextFactory: {
        createFromEvent: jest.fn(() => ({
          meetingLink: "",
          rawDescription: "",
          conferenceDetailsHtml: "",
          conferenceFingerprint: "",
          shadowLocation: "Room 101"
        }))
      },
      bufferDecisionService: {
        decide: jest
          .fn()
          .mockReturnValueOnce({ skipped: true })
          .mockReturnValueOnce({ skipped: false, minutes: 15, finalLocation: "Room 101" })
          .mockReturnValueOnce({ skipped: false, minutes: 15, finalLocation: "Room 101" })
          .mockReturnValueOnce({ skipped: false, minutes: 15, finalLocation: "Room 101" })
      }
    });
    const existingShadow = {
      getId: jest.fn(() => "shadow-1"),
      setTime: jest.fn(),
      setTitle: jest.fn(),
      setDescription: jest.fn(),
      setLocation: jest.fn(),
      setTag: jest.fn()
    };
    const persistedShadow = {
      getId: jest.fn(() => "shadow-1"),
      setTag: jest.fn()
    };
    const targetCalendar = {
      getId: jest.fn(() => "headstart-cal"),
      createEvent: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ getId: jest.fn(() => "shadow-2") })
    };

    manager.findLinkedShadowEvent = jest
      .fn()
      .mockReturnValueOnce(deletableShadow)
      .mockReturnValueOnce(existingShadow)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null);
    manager.getOrCreateHeadstartCalendar = jest.fn(() => targetCalendar);
    manager.getEventRobust = jest
      .fn()
      .mockReturnValueOnce(persistedShadow)
      .mockReturnValueOnce(null);
    manager._synchronizeShadowConferenceData = jest
      .fn()
      .mockReturnValueOnce("fp")
      .mockReturnValueOnce("fp");
    manager._applyShadowReminderPolicy = jest.fn();

    const skipped = manager.processEventBuffer(originalEvent, "AUTO", "calendar-1", {});
    expect(skipped.skipped).toBe(true);
    expect(deletableShadow.deleteEvent).toHaveBeenCalled();

    const updated = manager.processEventBuffer(originalEvent, "AUTO", "calendar-1", {});
    expect(updated.wasUpdate).toBe(true);
    expect(existingShadow.setTime).toHaveBeenCalled();
    expect(existingShadow.setLocation).toHaveBeenCalledWith("Room 101");
    expect(manager._applyShadowReminderPolicy).toHaveBeenCalledWith("headstart-cal", persistedShadow);

    expect(() => manager.processEventBuffer(originalEvent, "AUTO", "calendar-1", {})).toThrow(
      "Failed to create or update the Headstart buffer event."
    );
    expect(() => manager.processEventBuffer(originalEvent, "AUTO", "calendar-1", {})).toThrow(
      "Headstart buffer event could not be verified after save."
    );
  });
});
