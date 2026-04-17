const { ConferenceDetailsService } = require("../conferenceDetailsService.js");

describe("ConferenceDetailsService", () => {
  beforeEach(() => {
    global.Calendar = {
      Events: {
        get: jest.fn(),
        list: jest.fn(),
        instances: jest.fn()
      }
    };
  });

  test("falls back to iCalUID lookup when direct event get fails", () => {
    const service = new ConferenceDetailsService();
    const event = {
      getId: jest.fn(() => "ical-uid@example.com"),
      getStartTime: jest.fn(() => new Date("2026-03-18T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00Z"))
    };

    global.Calendar.Events.get.mockImplementation(() => {
      throw new Error("Not found");
    });
    global.Calendar.Events.list.mockReturnValue({
      items: [
        {
          start: { dateTime: "2026-03-18T10:00:00.000Z" },
          end: { dateTime: "2026-03-18T11:00:00.000Z" },
          conferenceData: {
            entryPoints: [
              {
                entryPointType: "video",
                uri: "https://meet.google.com/lookup-link"
              }
            ]
          }
        }
      ]
    });

    const details = service.getForEvent("calendar-1", event);

    expect(global.Calendar.Events.list).toHaveBeenCalledWith(
      "calendar-1",
      expect.objectContaining({
        iCalUID: "ical-uid@example.com",
        singleEvents: true,
        conferenceDataVersion: 1
      })
    );
    expect(details.meetingLink).toBe("https://meet.google.com/lookup-link");
    expect(details.detailsHtml).toContain("lookup-link");
  });

  test("uses lookup-hint conference details when the advanced lookup misses", () => {
    const service = new ConferenceDetailsService();
    const event = {
      getId: jest.fn(() => "ical-uid@example.com"),
      getStartTime: jest.fn(() => new Date("2026-03-18T10:00:00Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T11:00:00Z"))
    };

    global.Calendar.Events.get.mockImplementation(() => {
      throw new Error("Not found");
    });
    global.Calendar.Events.list.mockReturnValue({ items: [] });

    const details = service.getForEvent("calendar-1", event, {
      conferenceData: {
        conferenceSolution: { key: { type: "hangoutsMeet" } },
        entryPoints: [
          {
            entryPointType: "video",
            uri: "https://meet.google.com/from-event-object"
          }
        ]
      }
    });

    expect(details.meetingLink).toBe("https://meet.google.com/from-event-object");
    expect(details.detailsHtml).toContain("from-event-object");
    expect(details.hasNativeConferenceData).toBe(false);
  });

  test("uses fallback-only conference details when the advanced Calendar service is unavailable", () => {
    const service = new ConferenceDetailsService();
    const event = {
      getId: jest.fn(() => "event-1")
    };
    const originalCalendar = global.Calendar;
    delete global.Calendar;

    const details = service.getForEvent("calendar-1", event, {
      hangoutLink: "https://meet.google.com/fallback-only"
    });

    global.Calendar = originalCalendar;

    expect(details.meetingLink).toBe("https://meet.google.com/fallback-only");
    expect(details.detailsHtml).toContain("fallback-only");
  });

  test("findAdvancedEvent() returns null without the Calendar API or calendar id", () => {
    const service = new ConferenceDetailsService();

    expect(service.findAdvancedEvent("", {})).toBeNull();

    const originalCalendar = global.Calendar;
    delete global.Calendar;
    expect(service.findAdvancedEvent("calendar-1", {})).toBeNull();
    global.Calendar = originalCalendar;
  });

  test("findAdvancedEvent() can resolve via direct id and recurring-instance lookup", () => {
    const service = new ConferenceDetailsService();

    global.Calendar.Events.get.mockReturnValueOnce({ id: "direct-hit" });
    expect(service.findAdvancedEvent("calendar-1", { apiEventId: "event-1" })).toEqual({ id: "direct-hit" });

    global.Calendar.Events.get.mockReturnValueOnce(null);
    global.Calendar.Events.list.mockReturnValueOnce({ items: [] });
    global.Calendar.Events.instances.mockReturnValueOnce({
      items: [
        {
          id: "instance-1",
          start: { dateTime: "2026-03-18T10:00:00.000Z" },
          end: { dateTime: "2026-03-18T11:00:00.000Z" }
        }
      ]
    });

    expect(service.findAdvancedEvent("calendar-1", {
      recurringEventId: "series-1",
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    }).id).toBe("instance-1");
  });

  test("buildConferenceFingerprint(), _hasConferenceContent(), and _buildLookupRequest() cover empty and fallback cases", () => {
    const service = new ConferenceDetailsService();

    expect(service.buildConferenceFingerprint(null)).toBe("");
    expect(service._hasConferenceContent({ meetingLink: "", detailsHtml: "x", hasNativeConferenceData: false })).toBe(true);
    expect(service._hasConferenceContent({ meetingLink: "", detailsHtml: "", hasNativeConferenceData: false })).toBe(false);

    expect(service._buildLookupRequest({}, {
      eventId: "fallback-id",
      iCalUid: "ical-fallback",
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    })).toEqual(expect.objectContaining({
      apiEventId: "fallback-id",
      iCalUID: "ical-fallback"
    }));
  });

  test("_buildFallbackConferenceDetails() returns empty details when nothing is available", () => {
    const service = new ConferenceDetailsService();

    expect(service._buildFallbackConferenceDetails({})).toEqual({
      meetingLink: "",
      detailsHtml: "",
      nativeConferenceData: null,
      hasNativeConferenceData: false,
      conferenceFingerprint: "",
      advancedEventId: ""
    });
  });

  test("_buildFallbackConferenceDetails() fingerprints a hangout link when native data is not copyable", () => {
    const service = new ConferenceDetailsService();

    const details = service._buildFallbackConferenceDetails({
      hangoutLink: "https://meet.google.com/fingerprint",
      conferenceData: {
        entryPoints: [
          { entryPointType: "video", uri: "https://meet.google.com/fingerprint" }
        ]
      }
    });

    expect(details.meetingLink).toBe("https://meet.google.com/fingerprint");
    expect(details.hasNativeConferenceData).toBe(false);
    expect(details.conferenceFingerprint).not.toBe("");
  });

  test("_buildFallbackConferenceDetails() backfills a fingerprint when extraction leaves it blank", () => {
    const service = new ConferenceDetailsService();
    service._extractConferenceDetails = jest.fn(() => ({
      meetingLink: "",
      detailsHtml: "",
      nativeConferenceData: null,
      hasNativeConferenceData: false,
      conferenceFingerprint: "",
      advancedEventId: ""
    }));

    const details = service._buildFallbackConferenceDetails({
      conferenceData: {
        conferenceSolution: { key: { type: "hangoutsMeet" } }
      }
    });

    expect(details.conferenceFingerprint).not.toBe("");
  });

  test("_getAdvancedEventById() returns null for missing ids and fetch failures", () => {
    const service = new ConferenceDetailsService();

    expect(service._getAdvancedEventById("calendar-1", "")).toBeNull();

    global.Calendar.Events.get.mockImplementationOnce(() => {
      throw new Error("not found");
    });
    expect(service._getAdvancedEventById("calendar-1", "event-1")).toBeNull();
  });

  test("_findEventByICalUid() returns a matched item, the first item, or null on failure", () => {
    const service = new ConferenceDetailsService();

    global.Calendar.Events.list.mockReturnValueOnce({
      items: [
        {
          id: "matched",
          start: { dateTime: "2026-03-18T10:00:00.000Z" },
          end: { dateTime: "2026-03-18T11:00:00.000Z" }
        }
      ]
    });
    expect(service._findEventByICalUid("calendar-1", "ical@example.com", {
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    }).id).toBe("matched");

    global.Calendar.Events.list.mockReturnValueOnce({
      items: [
        {
          id: "first",
          start: { dateTime: "2026-03-18T09:00:00.000Z" },
          end: { dateTime: "2026-03-18T10:00:00.000Z" }
        }
      ]
    });
    expect(service._findEventByICalUid("calendar-1", "ical@example.com", {
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    }).id).toBe("first");

    global.Calendar.Events.list.mockImplementationOnce(() => {
      throw new Error("bad list");
    });
    expect(service._findEventByICalUid("calendar-1", "ical@example.com", {})).toBeNull();
    global.Calendar.Events.list.mockReturnValueOnce(null);
    expect(service._findEventByICalUid("calendar-1", "ical@example.com", {})).toBeNull();
    expect(service._findEventByICalUid("calendar-1", "", {})).toBeNull();
  });

  test("_findRecurringInstance() returns a matched item, the first item, or null on failure", () => {
    const service = new ConferenceDetailsService();

    global.Calendar.Events.instances.mockReturnValueOnce({
      items: [
        {
          id: "instance-1",
          start: { dateTime: "2026-03-18T10:00:00.000Z" },
          end: { dateTime: "2026-03-18T11:00:00.000Z" }
        }
      ]
    });
    expect(service._findRecurringInstance("calendar-1", "series-1", {
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    }).id).toBe("instance-1");

    global.Calendar.Events.instances.mockReturnValueOnce({
      items: [
        {
          id: "instance-first",
          start: { dateTime: "2026-03-18T09:00:00.000Z" },
          end: { dateTime: "2026-03-18T10:00:00.000Z" }
        }
      ]
    });
    expect(service._findRecurringInstance("calendar-1", "series-1", {
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    }).id).toBe("instance-first");

    global.Calendar.Events.instances.mockImplementationOnce(() => {
      throw new Error("bad instances");
    });
    expect(service._findRecurringInstance("calendar-1", "series-1", {})).toBeNull();
    global.Calendar.Events.instances.mockReturnValueOnce(null);
    expect(service._findRecurringInstance("calendar-1", "series-1", {})).toBeNull();
    expect(service._findRecurringInstance("calendar-1", "", {})).toBeNull();
  });

  test("_findBestTimeMatch(), _getEventTimeBounds(), and _normalizeTime() cover exact, empty, and invalid cases", () => {
    const service = new ConferenceDetailsService();
    const items = [
      {
        id: "match",
        start: { dateTime: "2026-03-18T10:00:00.000Z" },
        end: { dateTime: "2026-03-18T11:00:00.000Z" }
      }
    ];

    expect(service._findBestTimeMatch(items, {
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    }).id).toBe("match");
    expect(service._findBestTimeMatch(items, {})).toBeNull();

    expect(service._getEventTimeBounds({})).toEqual({
      timeMin: undefined,
      timeMax: undefined
    });
    expect(service._getEventTimeBounds({
      startTime: "2026-03-18T10:00:00.000Z",
      endTime: "2026-03-18T11:00:00.000Z"
    })).toEqual(expect.objectContaining({
      timeMin: expect.any(String),
      timeMax: expect.any(String)
    }));

    expect(service._normalizeTime("bad-date")).toBeNull();
    expect(service._normalizeTime({ date: "2026-03-18" })).toBeInstanceOf(Date);
    expect(service._normalizeTime({})).toBeNull();
    expect(service._readEventDateMs("bad-date")).toBeNull();
  });

  test("_extractConferenceDetails() formats multiple entry point types and codes", () => {
    const service = new ConferenceDetailsService();

    const details = service._extractConferenceDetails({
      id: "advanced-1",
      hangoutLink: "https://meet.google.com/main-link",
      conferenceData: {
        signature: "sig",
        entryPoints: [
          {
            entryPointType: "video",
            uri: "https://meet.google.com/main-link"
          },
          {
            entryPointType: "phone",
            label: "+44 20 1111 2222",
            pin: "123456"
          },
          {
            entryPointType: "sip",
            uri: "sip:user@example.com",
            accessCode: "999"
          },
          {
            entryPointType: "more",
            label: "More ways",
            passcode: "456",
            password: "secret",
            meetingCode: "room-1"
          }
        ]
      }
    });

    expect(details.meetingLink).toBe("https://meet.google.com/main-link");
    expect(details.detailsHtml).toContain("Phone: +44 20 1111 2222");
    expect(details.detailsHtml).toContain("PIN: 123456");
    expect(details.detailsHtml).toContain("SIP: <a href='sip:user@example.com'>sip:user@example.com</a>");
    expect(details.detailsHtml).toContain("Access code: 999");
    expect(details.detailsHtml).toContain("More: More ways");
    expect(details.detailsHtml).toContain("Passcode: 456");
    expect(details.detailsHtml).toContain("Password: secret");
    expect(details.detailsHtml).toContain("Meeting code: room-1");
    expect(details.advancedEventId).toBe("advanced-1");
  });

  test("_findFirstUri() and _getEntryPointLabel() cover empty and unknown cases", () => {
    const service = new ConferenceDetailsService();

    expect(service._findFirstUri([{ label: "No link" }])).toBe("");
    expect(service._formatEntryPoint({ entryPointType: "unknown", label: "Fallback label" })).toBe("Conference: Fallback label");
    expect(service._formatEntryPoint(null)).toBe("");
    expect(service._stableStringify(undefined)).toBe("null");

    const details = service._extractConferenceDetails({
      entryPoints: [null],
      hangoutLink: "",
      conferenceData: null
    });
    expect(details.meetingLink).toBe("");
  });
});
