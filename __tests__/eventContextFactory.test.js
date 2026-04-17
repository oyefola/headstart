const { EventContextFactory } = require("../eventContextFactory.js");

describe("EventContextFactory", () => {
  test("prefers structured conference details over text parsing", () => {
    const factory = new EventContextFactory({
      getForEvent: jest.fn(() => ({
        meetingLink: "https://meet.google.com/structured-link",
        detailsHtml: "Video: <a href='https://meet.google.com/structured-link'>https://meet.google.com/structured-link</a><br>Phone: +44 20 1234 5678",
        nativeConferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/structured-link" }] },
        hasNativeConferenceData: true,
        conferenceFingerprint: "native-fingerprint"
      }))
    });

    const event = {
      getLocation: jest.fn(() => ""),
      getDescription: jest.fn(() => "No visible link here")
    };

    const context = factory.createFromEvent(event, "calendar-id");

    expect(context.meetingLink).toBe("https://meet.google.com/structured-link");
    expect(context.conferenceDetailsHtml).toContain("Phone:");
    expect(context.finalLocation).toBe("");
    expect(context.shadowLocation).toBe("");
    expect(context.isOnline).toBe(true);
    expect(context.hasNativeConferenceData).toBe(true);
    expect(context.conferenceFingerprint).toBe("native-fingerprint");
  });

  test("falls back to regex parsing when structured conference data is unavailable", () => {
    const factory = new EventContextFactory({
      getForEvent: jest.fn(() => ({
        meetingLink: "",
        detailsHtml: "",
        nativeConferenceData: null,
        hasNativeConferenceData: false,
        conferenceFingerprint: ""
      }))
    });

    const event = {
      getLocation: jest.fn(() => ""),
      getDescription: jest.fn(() => "Join https://meet.google.com/fallback-link")
    };

    const context = factory.createFromEvent(event, "calendar-id");

    expect(context.meetingLink).toBe("https://meet.google.com/fallback-link");
    expect(context.conferenceDetailsHtml).toBe("");
    expect(context.finalLocation).toBe("https://meet.google.com/fallback-link");
    expect(context.isOnline).toBe(true);
    expect(context.conferenceFingerprint).toBe("https://meet.google.com/fallback-link");
  });

  test("respects an explicit in-person selection when a meeting link also exists", () => {
    const factory = new EventContextFactory({
      getForEvent: jest.fn(() => ({
        meetingLink: "https://meet.google.com/structured-link",
        detailsHtml: "",
        nativeConferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/structured-link" }] },
        hasNativeConferenceData: true,
        conferenceFingerprint: "native-fingerprint"
      }))
    });

    const event = {
      getLocation: jest.fn(() => "Boardroom 2"),
      getDescription: jest.fn(() => "Hybrid meeting")
    };

    const context = factory.createFromEvent(event, "calendar-id", {
      attendanceMode: "physical",
      resolvedManualLocation: "Boardroom 2"
    });

    expect(context.rawLocation).toBe("Boardroom 2");
    expect(context.meetingLink).toBe("https://meet.google.com/structured-link");
    expect(context.finalLocation).toBe("Boardroom 2");
    expect(context.shadowLocation).toBe("Boardroom 2");
    expect(context.isOnline).toBe(false);
  });

  test("defaults hybrid events to physical buffering while preserving the meeting link", () => {
    const factory = new EventContextFactory({
      getForEvent: jest.fn(() => ({
        meetingLink: "https://meet.google.com/structured-link",
        detailsHtml: "Video: <a href='https://meet.google.com/structured-link'>https://meet.google.com/structured-link</a>",
        nativeConferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/structured-link" }] },
        hasNativeConferenceData: true,
        conferenceFingerprint: "native-fingerprint"
      }))
    });

    const event = {
      getLocation: jest.fn(() => "Boardroom 2"),
      getDescription: jest.fn(() => "Hybrid meeting")
    };

    const context = factory.createFromEvent(event, "calendar-id");

    expect(context.rawLocation).toBe("Boardroom 2");
    expect(context.meetingLink).toBe("https://meet.google.com/structured-link");
    expect(context.finalLocation).toBe("Boardroom 2");
    expect(context.shadowLocation).toBe("Boardroom 2");
    expect(context.isOnline).toBe(false);
    expect(context.hasPhysicalLocation).toBe(true);
  });

  test("respects an explicit online selection even when the event location is physical", () => {
    const factory = new EventContextFactory({
      getForEvent: jest.fn(() => ({
        meetingLink: "",
        detailsHtml: "",
        nativeConferenceData: null,
        hasNativeConferenceData: false,
        conferenceFingerprint: ""
      }))
    });

    const event = {
      getLocation: jest.fn(() => "Boardroom 2"),
      getDescription: jest.fn(() => "Hybrid meeting")
    };

    const context = factory.createFromEvent(event, "calendar-id", {
      attendanceMode: "online",
      resolvedManualLocation: "https://meet.google.com/manual-link"
    });

    expect(context.rawLocation).toBe("Boardroom 2");
    expect(context.meetingLink).toBe("https://meet.google.com/manual-link");
    expect(context.finalLocation).toBe("https://meet.google.com/manual-link");
    expect(context.isOnline).toBe(true);
  });

  test("uses a manually supplied location when the source event has no location", () => {
    const factory = new EventContextFactory({
      getForEvent: jest.fn(() => ({
        meetingLink: "",
        detailsHtml: "",
        nativeConferenceData: null,
        hasNativeConferenceData: false,
        conferenceFingerprint: ""
      })),
      buildConferenceFingerprint: jest.fn(() => "manual-fingerprint")
    });

    const event = {
      getLocation: jest.fn(() => ""),
      getDescription: jest.fn(() => "")
    };

    const context = factory.createFromEvent(event, "calendar-id", {
      resolvedManualLocation: "Room 204"
    });

    expect(context.rawLocation).toBe("Room 204");
    expect(context.finalLocation).toBe("Room 204");
    expect(context.isOnline).toBe(false);
  });

  test("builds a fingerprint for a detected meeting link and can extract links from the location field", () => {
    const factory = new EventContextFactory({
      getForEvent: jest.fn(() => ({
        meetingLink: "",
        detailsHtml: "",
        nativeConferenceData: null,
        hasNativeConferenceData: false,
        conferenceFingerprint: ""
      })),
      buildConferenceFingerprint: jest.fn(() => "fingerprinted-link")
    });

    const event = {
      getLocation: jest.fn(() => "https://meet.google.com/from-location"),
      getDescription: jest.fn(() => "")
    };

    const context = factory.createFromEvent(event, "calendar-id");

    expect(context.meetingLink).toBe("https://meet.google.com/from-location");
    expect(context.conferenceFingerprint).toBe("fingerprinted-link");
    expect(factory.extractMeetingLink("https://meet.google.com/from-location", "")).toBe("https://meet.google.com/from-location");
  });

  test("treats plain keyword text in the location field as a physical location under the current rules", () => {
    const factory = new EventContextFactory({
      getForEvent: jest.fn(() => ({
        meetingLink: "",
        detailsHtml: "",
        nativeConferenceData: null,
        hasNativeConferenceData: false,
        conferenceFingerprint: ""
      }))
    });

    const keywords = [
      "Zoom joining details",
      "Teams meeting",
      "Meet session"
    ];

    keywords.forEach((locationText) => {
      const context = factory.createFromEvent({
        getLocation: jest.fn(() => locationText),
        getDescription: jest.fn(() => "")
      }, "calendar-id");

      expect(context.isOnline).toBe(false);
    });
  });
});
