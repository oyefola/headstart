/**
 * MOCKING GOOGLE APPS SCRIPT
 * This file creates "fake" versions of Google's global objects so that
 * Jest can run our code locally without crashing.
 */

const userPropertiesMock = {
    getProperties: jest.fn(() => ({
        HOME_ADDRESS: "123 Fake Street, Sheffield",
        WALK_LIMIT: "2.5",
    })),
    getProperty: jest.fn((key) => {
        if (key === "ONBOARDING_COMPLETE") return "true";
        return null;
    }),
    setProperty: jest.fn(),
    setProperties: jest.fn(),
};

global.PropertiesService = {
    getUserProperties: jest.fn(() => userPropertiesMock),
};

global.ScriptApp = {
    getProjectTriggers: jest.fn(() => []),
    newTrigger: jest.fn(() => ({
        timeBased: jest.fn().mockReturnThis(),
        everyDays: jest.fn().mockReturnThis(),
        create: jest.fn(),
    })),
};

global.CalendarApp = {
    Color: {
        ORANGE: "10",
        BLUE: "11",
        GREEN: "8",
        RED: "4",
        PURPLE: "3",
    },
    GuestStatus: {
        NO: "no",
    },
};

global.Calendar = {
    Events: {
        get: jest.fn(),
        list: jest.fn(() => ({ items: [] })),
        instances: jest.fn(() => ({ items: [] })),
        patch: jest.fn(),
    },
    CalendarList: {
        patch: jest.fn(),
    },
};

// We mock Maps.newDirectionFinder to simulate what Google Maps returns
global.Maps = {
    DirectionFinder: {
        Mode: {
            WALKING: "walking",
            DRIVING: "driving",
            TRANSIT: "transit",
        },
    },
    newDirectionFinder: jest.fn(() => ({
        setOrigin: jest.fn().mockReturnThis(),
        setDestination: jest.fn().mockReturnThis(),
        setMode: jest.fn().mockReturnThis(),
        setArrive: jest.fn().mockReturnThis(),
        setArrivalTime: jest.fn().mockReturnThis(),
        getDirections: jest.fn(() => ({
            status: "OK",
            routes: [
                {
                    legs: [
                        {
                            distance: { value: 1200 }, // 1.2km
                            duration: { value: 900 }, // 15 minutes
                        },
                    ],
                },
            ],
        })),
    })),
};

global.Utilities = {
    base64Encode: jest.fn((value) => Buffer.from(value, "utf8").toString("base64")),
    base64Decode: jest.fn((value) => Buffer.from(value, "base64")),
    newBlob: jest.fn((value) => ({
        getDataAsString: jest.fn(() => Buffer.from(value).toString("utf8")),
    })),
    formatDate: jest.fn((date, timeZone, pattern) => {
        if (!(date instanceof Date) || isNaN(date.getTime())) return "";
        const weekday = date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
        const datePart = date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
        });
        const timePart = date.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "UTC",
        });
        return `${weekday}, ${datePart} at ${timePart}`;
    }),
    sleep: jest.fn(),
};

global.Session = {
    getScriptTimeZone: jest.fn(() => "Europe/London"),
};
