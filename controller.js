/**
 * Entry points required by the appsscript.json manifest.
 * These must remain as standard functions, not class methods.
 */

function normalizeEventTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value.dateTime || value.date) {
    return normalizeEventTime(value.dateTime || value.date);
  }
  return null;
}

function encodeActionJson(value) {
  if (!value) return "";

  try {
    const json = JSON.stringify(value);
    if (typeof Utilities !== "undefined" && Utilities.base64Encode) {
      return Utilities.base64Encode(json);
    }
    return json;
  } catch (err) {
    return "";
  }
}

function decodeActionJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    if (typeof Utilities !== "undefined" && Utilities.base64Decode && Utilities.newBlob) {
      const decoded = Utilities.newBlob(Utilities.base64Decode(value)).getDataAsString();
      return JSON.parse(decoded);
    }
  } catch (err) {}

  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

function buildEventLookupHints(parameters, calendarEvent) {
  const rawParameters = parameters || {};
  const rawCalendarEvent = calendarEvent || {};

  const parameterStart = normalizeEventTime(rawParameters.eventStart || rawParameters.startTime);
  const parameterEnd = normalizeEventTime(rawParameters.eventEnd || rawParameters.endTime);
  const calendarStart = normalizeEventTime(rawCalendarEvent.start);
  const calendarEnd = normalizeEventTime(rawCalendarEvent.end);
  const parameterConferenceData = decodeActionJson(rawParameters.eventConferenceData || rawParameters.conferenceData);

  return {
    apiEventId: rawParameters.eventApiId || rawParameters.apiEventId || rawCalendarEvent.id || "",
    recurringEventId: rawParameters.recurringEventId || rawCalendarEvent.recurringEventId || "",
    startTime: parameterStart || calendarStart,
    endTime: parameterEnd || calendarEnd,
    conferenceData: parameterConferenceData || rawCalendarEvent.conferenceData || null,
    hangoutLink: rawParameters.eventHangoutLink || rawParameters.hangoutLink || rawCalendarEvent.hangoutLink || ""
  };
}

function serializeEventTime(value) {
  if (!value) return "";
  return value.toISOString ? value.toISOString() : "";
}

function readFormInputValue(formInput, fieldName) {
  if (!formInput || !fieldName) return "";
  const rawValue = formInput[fieldName];
  if (Array.isArray(rawValue)) {
    return rawValue.length ? String(rawValue[0]).trim() : "";
  }
  return rawValue ? String(rawValue).trim() : "";
}

function buildActionContext(event, eventHints, eventContext) {
  const hints = eventHints || {};
  const conferenceContext = eventContext || {};
  const startTime = hints.startTime || (event && event.getStartTime ? event.getStartTime() : null);
  const endTime = hints.endTime || (event && event.getEndTime ? event.getEndTime() : null);

  return {
    eventApiId: hints.apiEventId || "",
    recurringEventId: hints.recurringEventId || "",
    eventStart: serializeEventTime(startTime),
    eventEnd: serializeEventTime(endTime),
    eventConferenceData: encodeActionJson(conferenceContext.nativeConferenceData || hints.conferenceData || null),
    eventHangoutLink: conferenceContext.meetingLink || hints.hangoutLink || ""
  };
}

function findEventAndCalendar(calManager, initialCalId, eventId, eventHints) {
  let event = calManager.getEventRobust(initialCalId, eventId, eventHints);
  if (event) return { event, calId: initialCalId };
  
  const calendars = CalendarApp.getAllCalendars();
  for (let i = 0; i < calendars.length; i++) {
    event = calManager.getEventRobust(calendars[i].getId(), eventId, eventHints);
    if (event) return { event, calId: calendars[i].getId() };
  }
  return { event: null, calId: initialCalId };
}

function isHeadstartCalendarId(calendarId) {
  if (!calendarId || typeof CalendarApp === "undefined" || !CalendarApp.getCalendarById) return false;

  try {
    const calendar = CalendarApp.getCalendarById(calendarId);
    return !!(calendar && calendar.getName && calendar.getName() === CONFIG.CALENDAR_NAME);
  } catch (err) {
    return false;
  }
}

/**
 * Builds the add-on homepage, showing onboarding until the user completes it.
 * This is called directly by the Apps Script manifest.
 */
function onHomepage(e) {
  const appSettings = new AppSettings();
  const ui = new UIBuilder(appSettings.get());
  
  if (!appSettings.hasSeenTutorial()) {
    return ui.createOnboardingCard(false);
  }
  return ui.createDashboardCard(appSettings);
}

/**
 * Handles the Calendar event-open surface and chooses the next card to show.
 * It validates unsupported events, detects existing Headstart shadows, and
 * routes the user into manual details, hybrid mode selection, or buffer refresh.
 */
function onEventOpen(e) {
  const calendarId = e.calendar.calendarId;
  const eventId = e.calendar.id;
  const eventHints = buildEventLookupHints({}, e.calendar);
  // logs to help debug event data and conference data availability in the event open trigger, which can be inconsistent across accounts and event types
  console.log(
    "Event open conference state: canSeeConferenceData=" + !!(e.calendar.capabilities && e.calendar.capabilities.canSeeConferenceData) +
    ", canSetConferenceData=" + !!(e.calendar.capabilities && e.calendar.capabilities.canSetConferenceData) +
    ", hasConferenceData=" + !!eventHints.conferenceData +
    ", hasConferenceSignature=" + !!(eventHints.conferenceData && eventHints.conferenceData.signature) +
    ", hangoutLink=" + (eventHints.hangoutLink || "none")
  );
  const settings = new AppSettings().get();
  const travelEngine = new TravelEngine(settings);
  const calManager = new CalendarManager(settings, travelEngine);
  const ui = new UIBuilder(settings);

  if (!calendarId || !eventId) return ui.createUnsavedEventCard(); 

  let activeEventHints = eventHints;
  let { event, calId: activeCalId } = findEventAndCalendar(calManager, calendarId, eventId, eventHints);
  if (!event) return ui.createUnreadableEventCard();
  if (event.isAllDayEvent && event.isAllDayEvent()) {
    return ui.createAllDayEventCard();
  }
  
  const now = new Date();
  if (event.getStartTime() < now) {
    return ui.createPastEventCard();
  }

  const parentId = calManager.getParentIdFromShadow(event);
  if (parentId || isHeadstartCalendarId(activeCalId)) {
    return ui.createShadowInfoCard(event);
  }
  
  const existingShadow = calManager.findLinkedShadowEvent(event);
  const eventContext = calManager.createEventContext(event, activeCalId, activeEventHints);
  const actionContext = buildActionContext(event, activeEventHints, eventContext);
  actionContext.hasActiveBuffer = existingShadow ? "true" : "";
  const needsManualDetails = !eventContext.rawLocation && !eventContext.meetingLink;
  const isHybridEvent = !!(
    eventContext.rawLocation &&
    eventContext.meetingLink &&
    eventContext.rawLocation !== eventContext.meetingLink
  );

  if (needsManualDetails) {
    return ui.createManualDetailsCard(activeCalId, event.getId(), actionContext, {
      isUpdate: !!existingShadow
    });
  }

  if (!existingShadow && isHybridEvent) {
    return ui.createDisambiguationCard(
      activeCalId,
      event.getId(),
      eventContext.rawLocation,
      eventContext.meetingLink,
      actionContext
    );
  }

  return ui.createInitialContextCard(event, activeCalId, event.getId(), existingShadow, {
    actionContext: actionContext,
    requiresModeSelection: !!(existingShadow && isHybridEvent),
    requiresOriginSelection: !eventContext.isOnline,
    physicalLocation: eventContext.rawLocation,
    meetingLink: eventContext.meetingLink
  });
}

/**
 * Creates or refreshes a Headstart buffer for a single event.
 * The selected attendance mode and any manual location/link details are passed
 * into CalendarManager so the same workflow supports online and physical events.
 */
function handleCreateBuffer(e) {
  const calendarId = e.parameters.calendarId;
  const eventId = e.parameters.eventId;
  const eventHints = buildEventLookupHints(e.parameters, e.calendar);
  console.log(
    "Handle create buffer conference state: hasConferenceData=" + !!eventHints.conferenceData +
    ", hasConferenceSignature=" + !!(eventHints.conferenceData && eventHints.conferenceData.signature) +
    ", hangoutLink=" + (eventHints.hangoutLink || "none")
  );

  const appSettings = new AppSettings();
  const settings = appSettings.get();
  const travelEngine = new TravelEngine(settings);
  const calManager = new CalendarManager(settings, travelEngine);
  const ui = new UIBuilder(settings);

  let { event: originalEvent, calId: activeCalId } = findEventAndCalendar(calManager, calendarId, eventId, eventHints);
  if (!originalEvent) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(ui.createUnreadableEventCard()))
      .build();
  }
  if (originalEvent.isAllDayEvent && originalEvent.isAllDayEvent()) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(ui.createAllDayEventCard()))
      .build();
  }
  if (originalEvent.getStartTime() < new Date()) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(ui.createPastEventCard()))
      .build();
  }

  const parentId = calManager.getParentIdFromShadow ? calManager.getParentIdFromShadow(originalEvent) : null;
  if (parentId || isHeadstartCalendarId(activeCalId)) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(ui.createShadowInfoCard(originalEvent)))
      .build();
  }

  const manualPhysicalLocation = readFormInputValue(e.formInput, "manualPhysicalLocation");
  const manualMeetingLink = readFormInputValue(e.formInput, "manualMeetingLink");
  const resolvedManualLocation = e.parameters.resolvedLocation ||
    (e.parameters.attendanceMode === "online" ? manualMeetingLink : manualPhysicalLocation) ||
    "";
  const attendanceMode = e.parameters.attendanceMode || "";
  const originMode = e.parameters.originMode || "AUTO";
  const customOriginLocation = e.parameters.customOriginLocation || readFormInputValue(e.formInput, "customOriginLocation");
  const bufferOptions = {
    resolvedManualLocation: resolvedManualLocation,
    attendanceMode: attendanceMode,
    customOriginLocation: customOriginLocation,
    forceOnlineBuffer: false,
    eventApiId: eventHints.apiEventId,
    recurringEventId: eventHints.recurringEventId,
    eventStart: serializeEventTime(eventHints.startTime || originalEvent.getStartTime()),
    eventEnd: serializeEventTime(eventHints.endTime || originalEvent.getEndTime()),
    eventConferenceData: encodeActionJson(eventHints.conferenceData),
    eventHangoutLink: eventHints.hangoutLink || ""
  };

  let result;
  try {
    result = calManager.processEventBuffer(originalEvent, originMode, activeCalId, bufferOptions);
  } catch (err) {
    console.log("Single Event Buffer Error: " + err);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Headstart couldn't create the buffer for this event."))
      .build();
  }

  if (result.skipped) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(ui.createOnlineBufferDisabledCard()))
      .setNotification(CardService.newNotification().setText("Online buffering is turned off in Settings."))
      .build();
  }

  const notificationText = result.wasUpdate
    ? "Buffer refreshed in the Headstart calendar."
    : "Buffer created in the Headstart calendar.";

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(ui.createSuccessCard(result.wasUpdate)))
    .setNotification(CardService.newNotification().setText(notificationText))
    .setStateChanged(true)
    .build();
}

/**
 * Continues from the manual details card after the user enters a location,
 * meeting link, or both. Hybrid manual input is sent through mode selection.
 */
function onContinueBufferSetup(e) {
  const settings = new AppSettings().get();
  const ui = new UIBuilder(settings);
  const manualPhysicalLocation = readFormInputValue(e.formInput, "manualPhysicalLocation");
  const manualMeetingLink = readFormInputValue(e.formInput, "manualMeetingLink");

  if (!manualPhysicalLocation && !manualMeetingLink) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Add a location, a meeting link, or both."))
      .build();
  }

  if (manualPhysicalLocation && manualMeetingLink && manualPhysicalLocation !== manualMeetingLink) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().pushCard(
        ui.createDisambiguationCard(
          e.parameters.calendarId,
          e.parameters.eventId,
          manualPhysicalLocation,
          manualMeetingLink,
          {
            eventApiId: e.parameters.eventApiId || "",
            recurringEventId: e.parameters.recurringEventId || "",
            eventStart: e.parameters.eventStart || "",
            eventEnd: e.parameters.eventEnd || "",
            eventConferenceData: e.parameters.eventConferenceData || "",
            eventHangoutLink: e.parameters.eventHangoutLink || "",
            hasActiveBuffer: e.parameters.hasActiveBuffer || ""
          }
        )
      ))
      .build();
  }

  const nextParameters = Object.assign({}, e.parameters, {
    attendanceMode: manualMeetingLink ? "online" : "physical",
    resolvedLocation: manualMeetingLink || manualPhysicalLocation
  });

  if (!manualMeetingLink && manualPhysicalLocation) {
    return onShowOriginSelection({
      parameters: nextParameters,
      formInput: e.formInput || {},
      calendar: e.calendar || {}
    });
  }

  return handleCreateBuffer({
    parameters: nextParameters,
    formInput: e.formInput || {},
    calendar: e.calendar || {}
  });
}

/**
 * Opens the hybrid attendance selector for events with both a physical location
 * and a meeting link. Existing buffers carry a flag so replacement is confirmed.
 */
function onShowBufferModeSelection(e) {
  const settings = new AppSettings().get();
  const ui = new UIBuilder(settings);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(
      ui.createDisambiguationCard(
        e.parameters.calendarId,
        e.parameters.eventId,
        e.parameters.physicalLocation || "",
        e.parameters.meetingLink || "",
        {
          eventApiId: e.parameters.eventApiId || "",
          recurringEventId: e.parameters.recurringEventId || "",
          eventStart: e.parameters.eventStart || "",
          eventEnd: e.parameters.eventEnd || "",
          eventConferenceData: e.parameters.eventConferenceData || "",
          eventHangoutLink: e.parameters.eventHangoutLink || "",
          hasActiveBuffer: e.parameters.hasActiveBuffer || ""
        }
      )
    ))
    .build();
}

function buildParameterActionContext(parameters) {
  const rawParameters = parameters || {};
  return {
    eventApiId: rawParameters.eventApiId || "",
    recurringEventId: rawParameters.recurringEventId || "",
    eventStart: rawParameters.eventStart || "",
    eventEnd: rawParameters.eventEnd || "",
    eventConferenceData: rawParameters.eventConferenceData || "",
    eventHangoutLink: rawParameters.eventHangoutLink || "",
    attendanceMode: rawParameters.attendanceMode || "",
    resolvedLocation: rawParameters.resolvedLocation || "",
    originMode: rawParameters.originMode || "",
    customOriginLocation: rawParameters.customOriginLocation || "",
    hasActiveBuffer: rawParameters.hasActiveBuffer || ""
  };
}

function onShowOriginSelection(e) {
  const settings = new AppSettings().get();
  const ui = new UIBuilder(settings);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(
      ui.createOriginSelectionCard(
        e.parameters.calendarId,
        e.parameters.eventId,
        buildParameterActionContext(e.parameters)
      )
    ))
    .build();
}

function handleOriginSelection(e) {
  const originMode = e.parameters.originMode || "AUTO";
  const customOriginLocation = readFormInputValue(e.formInput, "customOriginLocation") ||
    e.parameters.customOriginLocation ||
    "";

  if (originMode === "CUSTOM" && !customOriginLocation) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Add a starting location, or choose Home or Last Event Location."))
      .build();
  }

  return handleCreateBuffer({
    parameters: Object.assign({}, e.parameters, {
      customOriginLocation: customOriginLocation
    }),
    formInput: e.formInput || {},
    calendar: e.calendar || {}
  });
}

/**
 * Confirms replacement before changing an already-active hybrid buffer.
 * This keeps online-to-physical and physical-to-online changes symmetric.
 */
function onConfirmBufferReplacement(e) {
  const settings = new AppSettings().get();
  const ui = new UIBuilder(settings);
  const attendanceMode = e.parameters.attendanceMode || "";

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(
      ui.createBufferReplacementChoiceCard(
        e.parameters.calendarId,
        e.parameters.eventId,
        e.parameters.resolvedLocation || "",
        Object.assign(buildParameterActionContext(e.parameters), {
          attendanceMode: attendanceMode,
          hasActiveBuffer: e.parameters.hasActiveBuffer || "true"
        })
      )
    ))
    .build();
}

/**
 * Deletes an existing linked Headstart buffer for the selected source event.
 * Used when the user explicitly decides the active shadow event is no longer needed.
 */
function handleDeleteBuffer(e) {
  const calendarId = e.parameters.calendarId;
  const eventId = e.parameters.eventId;
  const eventHints = buildEventLookupHints(e.parameters, e.calendar);
  const appSettings = new AppSettings();
  const settings = appSettings.get();
  const travelEngine = new TravelEngine(settings);
  const calManager = new CalendarManager(settings, travelEngine);
  const ui = new UIBuilder(settings);

  let { event: originalEvent, calId: activeCalId } = findEventAndCalendar(calManager, calendarId, eventId, eventHints);
  if (!originalEvent) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(ui.createUnreadableEventCard()))
      .build();
  }
  if (originalEvent.isAllDayEvent && originalEvent.isAllDayEvent()) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(ui.createAllDayEventCard()))
      .build();
  }
  if (originalEvent.getStartTime() < new Date()) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(ui.createPastEventCard()))
      .build();
  }

  const parentId = calManager.getParentIdFromShadow ? calManager.getParentIdFromShadow(originalEvent) : null;
  if (parentId || isHeadstartCalendarId(activeCalId)) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(ui.createShadowInfoCard(originalEvent)))
      .build();
  }

  const existingShadow = calManager.findLinkedShadowEvent(originalEvent);
  if (!existingShadow) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("No active Headstart buffer found."))
      .build();
  }

  try {
    existingShadow.deleteEvent();
  } catch (err) {
    console.log("Buffer delete error: " + err);
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Headstart couldn't delete the existing buffer."))
      .build();
  }

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(ui.createBufferDeletedCard()))
    .setNotification(CardService.newNotification().setText("Existing Headstart buffer deleted."))
    .setStateChanged(true)
    .build();
}

/**
 * Cancels a pending buffer replacement and leaves the existing shadow event unchanged.
 */
function handleCancelBufferReplacement(e) {
  const settings = new AppSettings().get();
  const ui = new UIBuilder(settings);

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(ui.createBufferChangeCancelledCard()))
    .setNotification(CardService.newNotification().setText("Buffer change cancelled."))
    .build();
}

/**
 * Runs a user-triggered batch sync for selected calendars and stores the selection
 * for future scheduled background syncs.
 */
function handleBatchSync(e) {
  const appSettings = new AppSettings();
  const settings = appSettings.get();
  const travelEngine = new TravelEngine(settings);
  const calManager = new CalendarManager(settings, travelEngine);
  const syncEngine = new SyncEngine(appSettings, calManager);
  const ui = new UIBuilder(settings);

  let selectedCalIds = e.formInput.selectedCalendars;

  if (!selectedCalIds) {
    return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText("Please select a calendar.")).build();
  }
  
  if (!Array.isArray(selectedCalIds)) selectedCalIds = [selectedCalIds];
  
  appSettings.saveSyncState(selectedCalIds);
  syncEngine.installDailyTrigger();

  const stats = syncEngine.runSyncEngine(selectedCalIds);
  appSettings.saveSyncStatus(stats);
  
  return ui.createBatchSuccessCard(stats);
}

/**
 * Entry point invoked by the daily Apps Script trigger for automatic sync.
 */
function runBackgroundSync() {
  console.log("Starting Daily Auto-Sync...");
  const appSettings = new AppSettings();
  const settings = appSettings.get();
  const travelEngine = new TravelEngine(settings);
  const calManager = new CalendarManager(settings, travelEngine);
  const syncEngine = new SyncEngine(appSettings, calManager);
  
  syncEngine.runBackgroundSync();
}

function handleFinishOnboarding(e) {
  const appSettings = new AppSettings();
  appSettings.setTutorialComplete();
  const ui = new UIBuilder(appSettings.get());
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(ui.createDashboardCard(appSettings))).build();
}

function onNavigateToSettings(e) {
  const appSettings = new AppSettings();
  appSettings.saveCheckboxState(e.formInput ? e.formInput.selectedCalendars : []);
  const ui = new UIBuilder(appSettings.get());
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(ui.createSettingsCard())).build();
}

function onNavigateToTutorial(e) {
  const appSettings = new AppSettings();
  appSettings.saveCheckboxState(e.formInput ? e.formInput.selectedCalendars : []);
  const ui = new UIBuilder(appSettings.get());
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().pushCard(ui.createOnboardingCard(true))).build();
}

/**
 * Persists settings from the CardService form and ensures the Headstart calendar exists.
 */
function handleSaveSettings(e) {
  const appSettings = new AppSettings();
  appSettings.save(e.formInput);
  
  const calManager = new CalendarManager(appSettings.get(), null);
  calManager.getOrCreateHeadstartCalendar(); 
  
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Settings Saved"))
    .setNavigation(CardService.newNavigation().popCard())
    .build();
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizeEventTime,
    encodeActionJson,
    decodeActionJson,
    buildEventLookupHints,
    serializeEventTime,
    readFormInputValue,
    buildActionContext,
    findEventAndCalendar,
    isHeadstartCalendarId,
    onHomepage,
    onEventOpen,
    handleCreateBuffer,
    onContinueBufferSetup,
    onShowBufferModeSelection,
    buildParameterActionContext,
    onShowOriginSelection,
    handleOriginSelection,
    onConfirmBufferReplacement,
    handleDeleteBuffer,
    handleCancelBufferReplacement,
    handleBatchSync,
    runBackgroundSync,
    handleFinishOnboarding,
    onNavigateToSettings,
    onNavigateToTutorial,
    handleSaveSettings
  };
}
