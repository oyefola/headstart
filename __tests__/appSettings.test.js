/**
 * Unit tests for the AppSettings class.
 */
const { AppSettings } = require("../settingsManager.js");

describe("AppSettings Class", () => {
    let settingsManager;

    beforeEach(() => {
        // Clear mock history before each test
        jest.clearAllMocks();
        settingsManager = new AppSettings();
    });

    test("get() should retrieve properties with correct fallbacks", () => {
        const settings = settingsManager.get();

        // Test that it pulled our mocked data from jest.setup.js
        expect(settings.homeAddress).toBe("123 Fake Street, Sheffield");

        // Test that it correctly applies fallbacks for missing data
        expect(settings.extraBuffer).toBe("0");
        expect(settings.transportMode).toBe("DRIVING");
    });

    test("get() should use defaults when properties are absent", () => {
        global.PropertiesService.getUserProperties().getProperties.mockImplementationOnce(() => ({}));

        const settings = settingsManager.get();

        expect(settings.onlineBuffer).toBe("15");
        expect(settings.bufferReminderMinutes).toBe("0");
        expect(settings.homeAddress).toBe("");
        expect(settings.walkLimit).toBe("2.0");
        expect(settings.calColor).toBe(global.CalendarApp.Color.ORANGE);
    });

    test("hasSeenTutorial() should return true based on mock", () => {
        const hasSeen = settingsManager.hasSeenTutorial();
        expect(hasSeen).toBe(true);
        expect(global.PropertiesService.getUserProperties().getProperty).toHaveBeenCalledWith("ONBOARDING_COMPLETE");
    });

    test("save() should format data correctly and call setProperties", () => {
        const mockInput = {
            setting_home: "New Address",
            setting_walk_limit: "3.0",
        };

        settingsManager.save(mockInput);

        // Verify setProperties was called
        const setPropsMock = global.PropertiesService.getUserProperties().setProperties;
        expect(setPropsMock).toHaveBeenCalled();

        // Verify it was called with the right mapped keys
        const savedData = setPropsMock.mock.calls[0][0];
        expect(savedData["HOME_ADDRESS"]).toBe("New Address");
        expect(savedData["WALK_LIMIT"]).toBe("3.0");
        // Verify fallbacks were saved for missing input
        expect(savedData["EXTRA_BUFFER"]).toBe("0");
    });

    test("save() should default blank online buffer input to 15", () => {
        settingsManager.save({
            setting_buffer_online: "true",
            setting_online_buffer: "   ",
        });

        const savedData = global.PropertiesService.getUserProperties().setProperties.mock.calls[0][0];
        expect(savedData["ONLINE_BUFFER"]).toBe("15");
    });

    test("save() should sanitize buffered reminder minutes and allow blank values", () => {
        settingsManager.save({
            setting_buffer_reminder_minutes: " 5 "
        });

        let savedData = global.PropertiesService.getUserProperties().setProperties.mock.calls[0][0];
        expect(savedData["BUFFER_REMINDER_MINUTES"]).toBe("5");

        jest.clearAllMocks();
        settingsManager.save({
            setting_buffer_reminder_minutes: "   "
        });

        savedData = global.PropertiesService.getUserProperties().setProperties.mock.calls[0][0];
        expect(savedData["BUFFER_REMINDER_MINUTES"]).toBe("");

        jest.clearAllMocks();
        settingsManager.save({
            setting_buffer_reminder_minutes: "999999"
        });

        savedData = global.PropertiesService.getUserProperties().setProperties.mock.calls[0][0];
        expect(savedData["BUFFER_REMINDER_MINUTES"]).toBe("40320");

        jest.clearAllMocks();
        settingsManager.save({
            setting_buffer_reminder_minutes: "-12"
        });

        savedData = global.PropertiesService.getUserProperties().setProperties.mock.calls[0][0];
        expect(savedData["BUFFER_REMINDER_MINUTES"]).toBe("0");
    });

    test("setTutorialComplete() should persist the onboarding flag", () => {
        settingsManager.setTutorialComplete();

        expect(global.PropertiesService.getUserProperties().setProperty).toHaveBeenCalledWith(
            "ONBOARDING_COMPLETE",
            "true"
        );
    });

    test("saveCheckboxState() should normalize a single calendar id to an array", () => {
        settingsManager.saveCheckboxState("calendar-1");

        expect(global.PropertiesService.getUserProperties().setProperty).toHaveBeenCalledWith(
            "SYNC_CALENDAR_IDS",
            JSON.stringify(["calendar-1"])
        );
    });

    test("saveCheckboxState() should default missing selections to an empty array", () => {
        settingsManager.saveCheckboxState();

        expect(global.PropertiesService.getUserProperties().setProperty).toHaveBeenCalledWith(
            "SYNC_CALENDAR_IDS",
            JSON.stringify([])
        );
    });

    test("saveSyncState() should delegate to saveCheckboxState()", () => {
        const spy = jest.spyOn(settingsManager, "saveCheckboxState");

        settingsManager.saveSyncState(["calendar-1", "calendar-2"]);

        expect(spy).toHaveBeenCalledWith(["calendar-1", "calendar-2"]);
    });

    test("getSyncState() should parse saved ids and last sync status", () => {
        const props = global.PropertiesService.getUserProperties();
        props.getProperty.mockImplementation((key) => {
            if (key === "SYNC_CALENDAR_IDS") return JSON.stringify(["calendar-1"]);
            if (key === "LAST_SYNC_STATUS") return "done";
            if (key === "ONBOARDING_COMPLETE") return "true";
            return null;
        });

        const syncState = settingsManager.getSyncState();

        expect(syncState).toEqual({
            savedIds: ["calendar-1"],
            lastStatus: "done"
        });
    });

    test("getSyncState() should return null saved ids when nothing is stored", () => {
        const props = global.PropertiesService.getUserProperties();
        props.getProperty.mockImplementation((key) => {
            if (key === "ONBOARDING_COMPLETE") return "true";
            return null;
        });

        expect(settingsManager.getSyncState()).toEqual({
            savedIds: null,
            lastStatus: null
        });
    });

    test("saveSyncStatus() should include errors only when errors are present", () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-04-17T10:15:00Z"));

        settingsManager.saveSyncStatus({
            processed: 3,
            skipped: 2,
            errors: 1
        });

        const savedStatus = global.PropertiesService.getUserProperties().setProperty.mock.calls.pop();
        expect(savedStatus[0]).toBe("LAST_SYNC_STATUS");
        expect(savedStatus[1]).toContain("Processed: 3 | Skipped: 2 | Errors: 1");

        jest.useRealTimers();
    });

    test("saveSyncStatus() omits the error suffix when there are no errors", () => {
        jest.useFakeTimers().setSystemTime(new Date("2026-04-17T10:15:00Z"));

        settingsManager.saveSyncStatus({
            processed: 4,
            skipped: 1,
            errors: 0
        });

        const savedStatus = global.PropertiesService.getUserProperties().setProperty.mock.calls.pop();
        expect(savedStatus[1]).toContain("Processed: 4 | Skipped: 1");
        expect(savedStatus[1]).not.toContain("Errors:");

        jest.useRealTimers();
    });
});
