const { SyncEngine } = require("../backgroundProcessing.js");

describe("SyncEngine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("installDailyTrigger() does nothing when the trigger already exists", () => {
    global.ScriptApp.getProjectTriggers.mockReturnValue([
      {
        getHandlerFunction: jest.fn(() => "runBackgroundSync")
      }
    ]);

    const syncEngine = new SyncEngine({}, {});
    syncEngine.installDailyTrigger();

    expect(global.ScriptApp.newTrigger).not.toHaveBeenCalled();
  });

  test("installDailyTrigger() creates the trigger when it does not exist", () => {
    global.ScriptApp.getProjectTriggers.mockReturnValue([
      {
        getHandlerFunction: jest.fn(() => "somethingElse")
      }
    ]);

    const syncEngine = new SyncEngine({}, {});
    syncEngine.installDailyTrigger();

    expect(global.ScriptApp.newTrigger).toHaveBeenCalledWith("runBackgroundSync");
  });

  test("runBackgroundSync() skips work when there are no saved calendar ids", () => {
    const appSettings = {
      getSyncState: jest.fn(() => ({ savedIds: null })),
      saveSyncStatus: jest.fn()
    };
    const syncEngine = new SyncEngine(appSettings, {});
    syncEngine.runSyncEngine = jest.fn();

    syncEngine.runBackgroundSync();

    expect(syncEngine.runSyncEngine).not.toHaveBeenCalled();
    expect(appSettings.saveSyncStatus).not.toHaveBeenCalled();
  });

  test("runBackgroundSync() runs sync and persists the latest status when calendars are configured", () => {
    const appSettings = {
      getSyncState: jest.fn(() => ({ savedIds: ["calendar-1"] })),
      saveSyncStatus: jest.fn()
    };
    const syncEngine = new SyncEngine(appSettings, {});
    syncEngine.runSyncEngine = jest.fn(() => ({ processed: 1, skipped: 0, errors: 0 }));

    syncEngine.runBackgroundSync();

    expect(syncEngine.runSyncEngine).toHaveBeenCalledWith(["calendar-1"]);
    expect(appSettings.saveSyncStatus).toHaveBeenCalledWith({ processed: 1, skipped: 0, errors: 0 });
  });

  test("_readTagNumber() and _readTagValue() handle invalid and throwing tags safely", () => {
    const syncEngine = new SyncEngine({}, {});
    const throwingEvent = {
      getTag: jest.fn(() => {
        throw new Error("bad tag");
      })
    };
    const invalidEvent = {
      getTag: jest.fn(() => "abc")
    };

    expect(syncEngine._readTagNumber(invalidEvent, "NUMBER_TAG")).toBeNull();
    expect(syncEngine._readTagNumber(throwingEvent, "NUMBER_TAG")).toBeNull();
    expect(syncEngine._readTagValue(throwingEvent, "TEXT_TAG")).toBe("");
    expect(syncEngine._readTagNumber(null, "NUMBER_TAG")).toBeNull();
    expect(syncEngine._readTagValue(null, "TEXT_TAG")).toBe("");
  });

  test("pruneOrphanedShadows() deletes shadows with missing parents or stale timing", () => {
    const shadowMissingParent = {
      getTag: jest.fn((tagName) => tagName === "HEADSTART_PARENT_CAL_ID" ? "calendar-1" : null),
      getStartTime: jest.fn(() => new Date("2026-04-17T09:00:00Z")),
      deleteEvent: jest.fn()
    };
    const shadowStale = {
      getTag: jest.fn((tagName) => {
        if (tagName === "HEADSTART_PARENT_CAL_ID") return "calendar-1";
        return null;
      }),
      getStartTime: jest.fn(() => new Date("2026-04-10T09:00:00Z")),
      deleteEvent: jest.fn()
    };
    const shadowValid = {
      getTag: jest.fn((tagName) => {
        if (tagName === "HEADSTART_PARENT_CAL_ID") return "calendar-1";
        return null;
      }),
      getStartTime: jest.fn(() => new Date("2026-04-17T09:00:00Z")),
      deleteEvent: jest.fn()
    };
    const targetCalendar = {
      getEvents: jest.fn(() => [shadowMissingParent, shadowStale, shadowValid])
    };
    const calManager = {
      getOrCreateHeadstartCalendar: jest.fn(() => targetCalendar),
      getParentIdFromShadow: jest
        .fn()
        .mockReturnValueOnce("parent-1")
        .mockReturnValueOnce("parent-2")
        .mockReturnValueOnce("parent-3"),
      getEventRobust: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({
          getStartTime: jest.fn(() => new Date("2026-04-17T12:00:00Z"))
        })
        .mockReturnValueOnce({
          getStartTime: jest.fn(() => new Date("2026-04-17T09:30:00Z"))
        })
    };

    global.CONFIG = {
      TAG_PARENT_CAL_ID: "HEADSTART_PARENT_CAL_ID"
    };

    const syncEngine = new SyncEngine({}, calManager);
    const pruned = syncEngine.pruneOrphanedShadows();

    expect(pruned).toBe(2);
    expect(shadowMissingParent.deleteEvent).toHaveBeenCalled();
    expect(shadowStale.deleteEvent).toHaveBeenCalled();
    expect(shadowValid.deleteEvent).not.toHaveBeenCalled();
  });

  test("pruneOrphanedShadows() skips shadows with missing linkage metadata", () => {
    const shadow = {
      getTag: jest.fn(() => null),
      deleteEvent: jest.fn()
    };
    const targetCalendar = {
      getEvents: jest.fn(() => [shadow])
    };
    const calManager = {
      getOrCreateHeadstartCalendar: jest.fn(() => targetCalendar),
      getParentIdFromShadow: jest.fn(() => null),
      getEventRobust: jest.fn()
    };
    global.CONFIG = {
      TAG_PARENT_CAL_ID: "HEADSTART_PARENT_CAL_ID"
    };

    const syncEngine = new SyncEngine({}, calManager);
    const pruned = syncEngine.pruneOrphanedShadows();

    expect(pruned).toBe(0);
    expect(shadow.deleteEvent).not.toHaveBeenCalled();
  });

  test("pruneOrphanedShadows() ignores delete failures and keeps going", () => {
    const shadow = {
      getTag: jest.fn((tagName) => tagName === "HEADSTART_PARENT_CAL_ID" ? "calendar-1" : null),
      getStartTime: jest.fn(() => new Date("2026-04-17T09:00:00Z")),
      deleteEvent: jest.fn(() => {
        throw new Error("cannot delete");
      })
    };
    const targetCalendar = {
      getEvents: jest.fn(() => [shadow])
    };
    const calManager = {
      getOrCreateHeadstartCalendar: jest.fn(() => targetCalendar),
      getParentIdFromShadow: jest.fn(() => "parent-1"),
      getEventRobust: jest.fn(() => null)
    };

    global.CONFIG = {
      TAG_PARENT_CAL_ID: "HEADSTART_PARENT_CAL_ID"
    };

    const syncEngine = new SyncEngine({}, calManager);
    expect(syncEngine.pruneOrphanedShadows()).toBe(0);
  });

  test("recalculates an existing shadow when tracking metadata is missing", () => {
    const eventStart = new Date("2026-03-18T09:00:00Z");
    const eventEnd = new Date("2026-03-18T10:00:00Z");
    const event = {
      isAllDayEvent: jest.fn(() => false),
      getMyStatus: jest.fn(() => "yes"),
      getTitle: jest.fn(() => "Hybrid standup"),
      getStartTime: jest.fn(() => eventStart),
      getEndTime: jest.fn(() => eventEnd)
    };
    const existingShadow = {
      getLocation: jest.fn(() => "Boardroom 2"),
      getTitle: jest.fn(() => "Hybrid standup"),
      getTag: jest.fn(() => null)
    };
    const calendar = {
      getEvents: jest.fn(() => [event])
    };
    const calManager = {
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => existingShadow),
      createEventContext: jest.fn(() => ({
        shadowLocation: "Boardroom 2",
        conferenceFingerprint: ""
      })),
      processEventBuffer: jest.fn()
    };

    global.CalendarApp.getCalendarById = jest.fn(() => calendar);
    global.CONFIG = {
      BATCH_DAYS: 3,
      CALENDAR_NAME: "Headstart",
      TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
      TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
      TAG_CONFERENCE_FINGERPRINT: "HEADSTART_CONFERENCE_FINGERPRINT"
    };

    const syncEngine = new SyncEngine({}, calManager);
    syncEngine.pruneOrphanedShadows = jest.fn(() => 0);

    const stats = syncEngine.runSyncEngine(["calendar-1"]);

    expect(calManager.processEventBuffer).toHaveBeenCalledWith(event, "AUTO", "calendar-1");
    expect(stats.processed).toBe(1);
    expect(stats.errors).toBe(0);
  });

  test("recalculates when conference metadata changes", () => {
    const eventStart = new Date("2026-03-18T09:00:00Z");
    const eventEnd = new Date("2026-03-18T10:00:00Z");
    const event = {
      isAllDayEvent: jest.fn(() => false),
      getMyStatus: jest.fn(() => "yes"),
      getTitle: jest.fn(() => "Hybrid standup"),
      getStartTime: jest.fn(() => eventStart),
      getEndTime: jest.fn(() => eventEnd)
    };
    const existingShadow = {
      getLocation: jest.fn(() => "Boardroom 2"),
      getTitle: jest.fn(() => "Hybrid standup"),
      getTag: jest.fn((tagName) => {
        if (tagName === "HEADSTART_PARENT_START_MS") return String(eventStart.getTime());
        if (tagName === "HEADSTART_PARENT_END_MS") return String(eventEnd.getTime());
        if (tagName === "HEADSTART_CONFERENCE_FINGERPRINT") return "old-fingerprint";
        return null;
      })
    };
    const calendar = {
      getEvents: jest.fn(() => [event])
    };
    const calManager = {
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => existingShadow),
      createEventContext: jest.fn(() => ({
        shadowLocation: "Boardroom 2",
        conferenceFingerprint: "new-fingerprint"
      })),
      processEventBuffer: jest.fn()
    };

    global.CalendarApp.getCalendarById = jest.fn(() => calendar);
    global.CONFIG = {
      BATCH_DAYS: 3,
      CALENDAR_NAME: "Headstart",
      TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
      TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
      TAG_CONFERENCE_FINGERPRINT: "HEADSTART_CONFERENCE_FINGERPRINT"
    };

    const syncEngine = new SyncEngine({}, calManager);
    syncEngine.pruneOrphanedShadows = jest.fn(() => 0);

    const stats = syncEngine.runSyncEngine(["calendar-1"]);

    expect(calManager.processEventBuffer).toHaveBeenCalledWith(event, "AUTO", "calendar-1");
    expect(stats.processed).toBe(1);
  });

  test("skips recalculation when the existing shadow already matches the event metadata", () => {
    const eventStart = new Date("2026-03-18T09:00:00Z");
    const eventEnd = new Date("2026-03-18T10:00:00Z");
    const event = {
      isAllDayEvent: jest.fn(() => false),
      getMyStatus: jest.fn(() => "yes"),
      getTitle: jest.fn(() => "Hybrid standup"),
      getStartTime: jest.fn(() => eventStart),
      getEndTime: jest.fn(() => eventEnd)
    };
    const existingShadow = {
      getLocation: jest.fn(() => "Boardroom 2"),
      getTitle: jest.fn(() => "Hybrid standup"),
      getTag: jest.fn((tagName) => {
        if (tagName === "HEADSTART_PARENT_START_MS") return String(eventStart.getTime());
        if (tagName === "HEADSTART_PARENT_END_MS") return String(eventEnd.getTime());
        if (tagName === "HEADSTART_CONFERENCE_FINGERPRINT") return "same-fingerprint";
        return null;
      })
    };
    const calendar = {
      getEvents: jest.fn(() => [event])
    };
    const calManager = {
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => existingShadow),
      createEventContext: jest.fn(() => ({
        shadowLocation: "Boardroom 2",
        conferenceFingerprint: "same-fingerprint"
      })),
      processEventBuffer: jest.fn()
    };

    global.CalendarApp.getCalendarById = jest.fn(() => calendar);
    global.CONFIG = {
      BATCH_DAYS: 3,
      CALENDAR_NAME: "Headstart",
      TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
      TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
      TAG_CONFERENCE_FINGERPRINT: "HEADSTART_CONFERENCE_FINGERPRINT"
    };

    const syncEngine = new SyncEngine({}, calManager);
    syncEngine.pruneOrphanedShadows = jest.fn(() => 0);

    const stats = syncEngine.runSyncEngine(["calendar-1"]);

    expect(calManager.processEventBuffer).not.toHaveBeenCalled();
    expect(stats.skipped).toBe(1);
    expect(stats.processed).toBe(0);
  });

  test("counts an error when refreshing an existing shadow fails", () => {
    const event = {
      isAllDayEvent: jest.fn(() => false),
      getMyStatus: jest.fn(() => "yes"),
      getTitle: jest.fn(() => "Hybrid standup"),
      getStartTime: jest.fn(() => new Date("2026-03-18T09:00:00Z")),
      getEndTime: jest.fn(() => new Date("2026-03-18T10:00:00Z"))
    };
    const existingShadow = {
      getLocation: jest.fn(() => "Old room"),
      getTitle: jest.fn(() => "Hybrid standup"),
      getTag: jest.fn(() => null)
    };
    const calendar = {
      getEvents: jest.fn(() => [event])
    };
    const calManager = {
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => existingShadow),
      createEventContext: jest.fn(() => ({
        shadowLocation: "New room",
        conferenceFingerprint: ""
      })),
      processEventBuffer: jest.fn(() => {
        throw new Error("refresh failed");
      })
    };

    global.CalendarApp.getCalendarById = jest.fn(() => calendar);
    global.CONFIG = {
      BATCH_DAYS: 3,
      CALENDAR_NAME: "Headstart",
      TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
      TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
      TAG_CONFERENCE_FINGERPRINT: "HEADSTART_CONFERENCE_FINGERPRINT"
    };

    const syncEngine = new SyncEngine({}, calManager);
    syncEngine.pruneOrphanedShadows = jest.fn(() => 0);

    const stats = syncEngine.runSyncEngine(["calendar-1"]);
    expect(stats.errors).toBe(1);
  });

  test("runSyncEngine() skips filtered events and counts batch errors", () => {
    const baseEvent = {
      getStartTime: jest.fn(() => new Date("2026-04-17T09:00:00Z")),
      getEndTime: jest.fn(() => new Date("2026-04-17T10:00:00Z"))
    };
    const events = [
      {
        ...baseEvent,
        isAllDayEvent: jest.fn(() => true),
        getMyStatus: jest.fn(() => "yes"),
        getTitle: jest.fn(() => "All day")
      },
      {
        ...baseEvent,
        isAllDayEvent: jest.fn(() => false),
        getMyStatus: jest.fn(() => global.CalendarApp.GuestStatus.NO),
        getTitle: jest.fn(() => "Declined")
      },
      {
        ...baseEvent,
        isAllDayEvent: jest.fn(() => false),
        getMyStatus: jest.fn(() => "yes"),
        getTitle: jest.fn(() => "Headstart: Existing")
      },
      {
        ...baseEvent,
        isAllDayEvent: jest.fn(() => false),
        getMyStatus: jest.fn(() => "yes"),
        getTitle: jest.fn(() => "Normal Event")
      }
    ];
    const calendar = {
      getEvents: jest.fn(() => events)
    };
    const calManager = {
      getParentIdFromShadow: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null),
      findLinkedShadowEvent: jest.fn(() => null),
      createEventContext: jest.fn(() => ({ shadowLocation: "", conferenceFingerprint: "" })),
      processEventBuffer: jest.fn(() => {
        throw new Error("boom");
      })
    };

    global.CalendarApp.getCalendarById = jest.fn(() => calendar);
    global.CONFIG = {
      BATCH_DAYS: 3,
      CALENDAR_NAME: "Headstart",
      TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
      TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
      TAG_CONFERENCE_FINGERPRINT: "HEADSTART_CONFERENCE_FINGERPRINT"
    };

    const syncEngine = new SyncEngine({}, calManager);
    syncEngine.pruneOrphanedShadows = jest.fn(() => 0);

    const stats = syncEngine.runSyncEngine(["calendar-1"]);

    expect(stats.skipped).toBe(3);
    expect(stats.errors).toBe(1);
  });

  test("runSyncEngine() processes a new eligible event and ignores calendar access failures", () => {
    const event = {
      isAllDayEvent: jest.fn(() => false),
      getMyStatus: jest.fn(() => "yes"),
      getTitle: jest.fn(() => "Normal Event"),
      getStartTime: jest.fn(() => new Date("2026-04-17T09:00:00Z")),
      getEndTime: jest.fn(() => new Date("2026-04-17T10:00:00Z"))
    };
    const calendar = {
      getEvents: jest.fn(() => [event])
    };
    const calManager = {
      getParentIdFromShadow: jest.fn(() => null),
      findLinkedShadowEvent: jest.fn(() => null),
      createEventContext: jest.fn(() => ({ shadowLocation: "", conferenceFingerprint: "" })),
      processEventBuffer: jest.fn()
    };

    global.CalendarApp.getCalendarById = jest
      .fn()
      .mockImplementationOnce(() => calendar)
      .mockImplementationOnce(() => {
        throw new Error("no access");
      });
    global.CONFIG = {
      BATCH_DAYS: 3,
      CALENDAR_NAME: "Headstart",
      TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
      TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
      TAG_CONFERENCE_FINGERPRINT: "HEADSTART_CONFERENCE_FINGERPRINT"
    };

    const syncEngine = new SyncEngine({}, calManager);
    syncEngine.pruneOrphanedShadows = jest.fn(() => 0);

    const stats = syncEngine.runSyncEngine(["calendar-1", "calendar-2"]);

    expect(calManager.processEventBuffer).toHaveBeenCalledWith(event, "AUTO", "calendar-1");
    expect(stats.processed).toBe(1);
    expect(stats.errors).toBe(0);
  });

  test("runSyncEngine() skips calendar ids that do not resolve to a readable calendar", () => {
    const calManager = {
      getParentIdFromShadow: jest.fn(),
      findLinkedShadowEvent: jest.fn(),
      createEventContext: jest.fn(),
      processEventBuffer: jest.fn()
    };

    global.CalendarApp.getCalendarById = jest.fn(() => null);
    global.CONFIG = {
      BATCH_DAYS: 3,
      CALENDAR_NAME: "Headstart",
      TAG_PARENT_START_MS: "HEADSTART_PARENT_START_MS",
      TAG_PARENT_END_MS: "HEADSTART_PARENT_END_MS",
      TAG_CONFERENCE_FINGERPRINT: "HEADSTART_CONFERENCE_FINGERPRINT"
    };

    const syncEngine = new SyncEngine({}, calManager);
    syncEngine.pruneOrphanedShadows = jest.fn(() => 0);

    expect(syncEngine.runSyncEngine(["calendar-1"]).processed).toBe(0);
  });
});
