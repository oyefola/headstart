/**
 * Handles all Calendar API interactions and state linking.
 */
function createEventContextFactory() {
  if (typeof EventContextFactory !== 'undefined') {
    return new EventContextFactory();
  }
  if (typeof require !== 'undefined') {
    return new (require("./eventContextFactory.js").EventContextFactory)();
  }
  throw new Error("EventContextFactory is unavailable.");
}

function createConferenceDetailsService() {
  if (typeof ConferenceDetailsService !== "undefined") {
    return new ConferenceDetailsService();
  }
  if (typeof require !== "undefined") {
    return new (require("./conferenceDetailsService.js").ConferenceDetailsService)();
  }
  throw new Error("ConferenceDetailsService is unavailable.");
}

function createShadowDescriptionBuilder() {
  if (typeof ShadowDescriptionBuilder !== 'undefined') {
    return new ShadowDescriptionBuilder();
  }
  if (typeof require !== 'undefined') {
    return new (require("./shadowDescriptionBuilder.js").ShadowDescriptionBuilder)();
  }
  throw new Error("ShadowDescriptionBuilder is unavailable.");
}

function createBufferDecisionService(settings, travelEngine) {
  if (typeof BufferDecisionService !== 'undefined') {
    return new BufferDecisionService(settings, travelEngine);
  }
  if (typeof require !== 'undefined') {
    const BufferDecisionServiceModule = require("./bufferDecisionService.js").BufferDecisionService;
    return new BufferDecisionServiceModule(settings, travelEngine);
  }
  throw new Error("BufferDecisionService is unavailable.");
}

/**
 * Coordinates all CalendarApp and Advanced Calendar API operations for Headstart.
 * It owns source-event lookup, shadow-event creation/update, metadata tags,
 * conference syncing, reminders, and duplicate shadow cleanup.
 */
class CalendarManager {
  constructor(settings, travelEngine, dependencies) {
    this.settings = settings;
    this.travelEngine = travelEngine;
    const services = dependencies || {};
    this.conferenceDetailsService = services.conferenceDetailsService || createConferenceDetailsService();
    this.eventContextFactory = services.eventContextFactory || createEventContextFactory();
    this.shadowDescriptionBuilder = services.shadowDescriptionBuilder || createShadowDescriptionBuilder();
    this.bufferDecisionService = services.bufferDecisionService || createBufferDecisionService(settings, travelEngine);
  }

  getUniversalEventId(event) {
    if (!event) return "UNKNOWN";
    const title = event.getTitle() || "Untitled";
    const startTime = event.getStartTime() ? event.getStartTime().getTime() : 0;
    const rawString = title + "_" + startTime;
    return Utilities.base64Encode(rawString);
  }

  _normalizeTimeHint(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (value.dateTime || value.date) {
      return this._normalizeTimeHint(value.dateTime || value.date);
    }
    return null;
  }

  _decodeSerializedJson(value) {
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

  _normalizeEventHints(eventHints) {
    const rawHints = eventHints || {};
    return {
      apiEventId: rawHints.apiEventId || rawHints.eventId || "",
      iCalUID: rawHints.iCalUID || rawHints.iCalUid || "",
      recurringEventId: rawHints.recurringEventId || "",
      startTime: this._normalizeTimeHint(rawHints.startTime),
      endTime: this._normalizeTimeHint(rawHints.endTime),
      conferenceData: rawHints.conferenceData || null,
      hangoutLink: rawHints.hangoutLink || ""
    };
  }

  _eventMatchesExactTime(event, eventHints) {
    if (!event || !eventHints.startTime || !eventHints.endTime) return true;
    return event.getStartTime().getTime() === eventHints.startTime.getTime() &&
      event.getEndTime().getTime() === eventHints.endTime.getTime();
  }

  _findEventByWindow(calendar, eventId, eventHints, paddingMs) {
    if (!calendar || !eventHints.startTime || !eventHints.endTime) return null;

    const padding = paddingMs || 60000;
    const searchStart = new Date(eventHints.startTime.getTime() - padding);
    const searchEnd = new Date(eventHints.endTime.getTime() + padding);

    try {
      const events = calendar.getEvents(searchStart, searchEnd);
      for (let i = 0; i < events.length; i++) {
        const candidate = events[i];
        if (eventId && candidate.getId() !== eventId) continue;
        if (!this._eventMatchesExactTime(candidate, eventHints)) continue;
        return candidate;
      }
    } catch (err) {}

    return null;
  }

  _findBuiltInEventFromAdvancedEvent(calendar, advancedEvent) {
    if (!calendar || !advancedEvent) return null;

    const advancedHints = this._normalizeEventHints({
      iCalUID: advancedEvent.iCalUID || "",
      startTime: advancedEvent.start,
      endTime: advancedEvent.end
    });

    const eventByWindow = this._findEventByWindow(calendar, advancedHints.iCalUID, advancedHints, 300000);
    if (eventByWindow) return eventByWindow;

    if (advancedHints.iCalUID) {
      try {
        const event = calendar.getEventById(advancedHints.iCalUID);
        if (event && this._eventMatchesExactTime(event, advancedHints)) return event;
        if (event && !advancedHints.startTime) return event;
      } catch (err) {}
    }

    if (!advancedHints.startTime || !advancedHints.endTime) return null;

    try {
      const searchStart = new Date(advancedHints.startTime.getTime() - (24 * 60 * 60 * 1000));
      const searchEnd = new Date(advancedHints.endTime.getTime() + (24 * 60 * 60 * 1000));
      const events = calendar.getEvents(searchStart, searchEnd);
      for (let i = 0; i < events.length; i++) {
        const candidate = events[i];
        if (!this._eventMatchesExactTime(candidate, advancedHints)) continue;
        if (advancedEvent.summary && candidate.getTitle() !== advancedEvent.summary) continue;
        return candidate;
      }
    } catch (err) {}

    return null;
  }

  _resolveEventFromAdvancedLookup(calendarId, eventId, eventHints) {
    if (!this.conferenceDetailsService) return null;

    const advancedEvent = this.conferenceDetailsService.findAdvancedEvent(calendarId, {
      apiEventId: eventHints.apiEventId || eventId,
      iCalUID: eventHints.iCalUID || eventId,
      recurringEventId: eventHints.recurringEventId,
      startTime: eventHints.startTime,
      endTime: eventHints.endTime
    });
    if (!advancedEvent) return null;

    const calendar = CalendarApp.getCalendarById(calendarId);
    return this._findBuiltInEventFromAdvancedEvent(calendar, advancedEvent);
  }

  /**
   * Resolves a Calendar event across the inconsistent IDs returned by Apps Script,
   * add-on payloads, recurring instances, and the Advanced Calendar API.
   */
  getEventRobust(calendarId, eventId, eventHints) {
    const calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) return null;
    const normalizedHints = this._normalizeEventHints(eventHints);

    const eventByWindow = this._findEventByWindow(calendar, eventId, normalizedHints, 300000);
    if (eventByWindow) return eventByWindow;

    let event = null;
    try { event = calendar.getEventById(eventId); } catch(e) {}
    if (event && this._eventMatchesExactTime(event, normalizedHints)) return event;
    if (event && !normalizedHints.startTime) return event;
    try { event = calendar.getEventById(eventId + '@google.com'); } catch(e) {}
    if (event && this._eventMatchesExactTime(event, normalizedHints)) return event;
    if (event && !normalizedHints.startTime) return event;
    try { 
      const decodedId = Utilities.newBlob(Utilities.base64Decode(eventId)).getDataAsString();
      event = calendar.getEventById(decodedId); 
      if (event && this._eventMatchesExactTime(event, normalizedHints)) return event;
      if (event && !normalizedHints.startTime) return event;
    } catch(e) {}
    try { event = calendar.getEventSeriesById(eventId); } catch(e) {}
    if (event && !normalizedHints.startTime) return event;

    const advancedResolvedEvent = this._resolveEventFromAdvancedLookup(calendarId, eventId, normalizedHints);
    if (advancedResolvedEvent) return advancedResolvedEvent;

    try {
      const now = new Date();
      const past = normalizedHints.startTime
        ? new Date(normalizedHints.startTime.getTime() - (7 * 24 * 60 * 60 * 1000))
        : new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
      const future = normalizedHints.endTime
        ? new Date(normalizedHints.endTime.getTime() + (7 * 24 * 60 * 60 * 1000))
        : new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000));
      const events = calendar.getEvents(past, future);
      for (let i = 0; i < events.length; i++) {
        const candidate = events[i];
        if (eventId && !candidate.getId().includes(eventId) && candidate.getId() !== normalizedHints.iCalUID) continue;
        if (!this._eventMatchesExactTime(candidate, normalizedHints)) continue;
        return candidate;
      }
    } catch(e) {}

    return null;
  }

  getOrCreateHeadstartCalendar() {
    const calendars = CalendarApp.getAllCalendars();
    for (let i = 0; i < calendars.length; i++) { 
      if (calendars[i].getName() === CONFIG.CALENDAR_NAME) {
        try { calendars[i].setColor(this.settings.calColor); } catch(e){}
        this.ensureHeadstartCalendarVisible(calendars[i].getId());
        return calendars[i]; 
      } 
    }
    const newCal = CalendarApp.createCalendar(CONFIG.CALENDAR_NAME);
    try { newCal.setColor(this.settings.calColor); } catch(e){}
    this.ensureHeadstartCalendarVisible(newCal.getId());
    return newCal;
  }

  ensureHeadstartCalendarVisible(calendarId) {
    if (typeof Calendar === 'undefined' || !calendarId) return;

    try {
      Calendar.CalendarList.patch({
        selected: true,
        hidden: false
      }, calendarId);
    } catch (err) {}
  }

  _cloneConferenceData(conferenceData) {
    return conferenceData ? JSON.parse(JSON.stringify(conferenceData)) : null;
  }

  _findShadowEventResource(targetCalendarId, shadowEvent) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const shadowResource = this.conferenceDetailsService.findAdvancedEvent(targetCalendarId, {
        iCalUID: shadowEvent.getId(),
        startTime: shadowEvent.getStartTime(),
        endTime: shadowEvent.getEndTime()
      });

      if (shadowResource && shadowResource.id) {
        return shadowResource;
      }

      if (attempt < 2 && Utilities && Utilities.sleep) {
        Utilities.sleep(200);
      }
    }

    if (typeof Calendar !== "undefined" && Calendar.Events && Calendar.Events.list) {
      try {
        const response = Calendar.Events.list(targetCalendarId, {
          singleEvents: true,
          timeMin: new Date(shadowEvent.getStartTime().getTime() - 60000).toISOString(),
          timeMax: new Date(shadowEvent.getEndTime().getTime() + 60000).toISOString(),
          conferenceDataVersion: 1
        });
        const items = response && response.items ? response.items : [];
        const targetTitle = shadowEvent.getTitle ? (shadowEvent.getTitle() || "") : "";
        const targetStartMs = shadowEvent.getStartTime().getTime();
        const targetEndMs = shadowEvent.getEndTime().getTime();

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const itemStart = item.start && (item.start.dateTime || item.start.date);
          const itemEnd = item.end && (item.end.dateTime || item.end.date);
          const itemStartMs = itemStart ? new Date(itemStart).getTime() : null;
          const itemEndMs = itemEnd ? new Date(itemEnd).getTime() : null;

          if (itemStartMs !== targetStartMs || itemEndMs !== targetEndMs) continue;
          if (targetTitle && item.summary && item.summary !== targetTitle) continue;
          if (item.id) return item;
        }
      } catch (err) {
        console.log("Shadow resource list fallback failed: " + err);
      }
    }

    return null;
  }

  _getShadowReminderMinutes() {
    const rawValue = this.settings && this.settings.bufferReminderMinutes;
    if (rawValue === undefined || rawValue === null) return 0;

    const normalized = String(rawValue).trim();
    if (normalized === "") return null;

    return Math.min(40320, Math.max(0, parseInt(normalized, 10) || 0));
  }

  _applyShadowReminderPolicy(targetCalendarId, shadowEvent) {
    if (!shadowEvent) return;

    const reminderMinutes = this._getShadowReminderMinutes();
    try {
      shadowEvent.removeAllReminders();
    } catch (err) {
      console.log("Shadow reminder clear failed: " + err);
    }

    if (reminderMinutes === null) {
      const clearResource = targetCalendarId ? this._findShadowEventResource(targetCalendarId, shadowEvent) : null;
      if (clearResource && clearResource.id && typeof Calendar !== "undefined" && Calendar.Events && Calendar.Events.patch) {
        try {
          Calendar.Events.patch({
            reminders: {
              useDefault: false,
              overrides: []
            }
          }, targetCalendarId, clearResource.id, {
            sendUpdates: "none"
          });
        } catch (err) {
          console.log("Shadow reminder clear patch failed: " + err);
        }
      }
      return;
    }

    if (reminderMinutes >= 5 && shadowEvent.addPopupReminder) {
      try {
        shadowEvent.addPopupReminder(reminderMinutes);
        console.log("Shadow reminder applied natively: minutes=" + reminderMinutes);
        return;
      } catch (err) {
        console.log("Shadow reminder native add failed: " + err);
      }
    }

    const shadowResource = targetCalendarId ? this._findShadowEventResource(targetCalendarId, shadowEvent) : null;
    if (shadowResource && shadowResource.id && typeof Calendar !== "undefined" && Calendar.Events && Calendar.Events.patch) {
      try {
        Calendar.Events.patch({
          reminders: {
            useDefault: false,
            overrides: [{
              method: "popup",
              minutes: reminderMinutes
            }]
          }
        }, targetCalendarId, shadowResource.id, {
          sendUpdates: "none"
        });

        if (Calendar.Events.get) {
          try {
            const verifiedEvent = Calendar.Events.get(targetCalendarId, shadowResource.id);
            const overrides = verifiedEvent && verifiedEvent.reminders && verifiedEvent.reminders.overrides;
            console.log(
              "Shadow reminder verification: minutes=" + reminderMinutes +
              ", overrideCount=" + (overrides ? overrides.length : 0)
            );
          } catch (readErr) {
            console.log("Shadow reminder verification failed: " + readErr);
          }
        }
        return;
      } catch (err) {
        console.log("Shadow reminder patch failed: " + err);
      }
    }

    if (reminderMinutes === 0) {
      console.log("Shadow reminder unavailable: 0-minute popup reminders require Advanced Calendar reminder patching and a resolvable shadow resource.");
      return;
    }

    if (shadowEvent.addPopupReminder) {
      try {
        shadowEvent.addPopupReminder(reminderMinutes);
      } catch (err) {
        console.log("Shadow reminder fallback failed: " + err);
      }
    }
  }

  _synchronizeShadowConferenceData(targetCalendarId, shadowEvent, eventContext) {
    const defaultFingerprint = eventContext.conferenceFingerprint || "";
    if (!shadowEvent || !targetCalendarId || !this.conferenceDetailsService) {
      console.log("Conference sync skipped: missing shadow event, target calendar, or conference service.");
      return defaultFingerprint;
    }

    const shadowResource = this._findShadowEventResource(targetCalendarId, shadowEvent);

    if (!shadowResource || !shadowResource.id || typeof Calendar === "undefined" || !Calendar.Events || !Calendar.Events.patch) {
      console.log(
        "Conference sync unavailable: shadowResource=" + (!!shadowResource) +
        ", hasPatchApi=" + !!(typeof Calendar !== "undefined" && Calendar.Events && Calendar.Events.patch) +
        ", sourceHasNativeConferenceData=" + eventContext.hasNativeConferenceData
      );
      return eventContext.hasNativeConferenceData ? undefined : defaultFingerprint;
    }

    const shadowHasNativeConference = !!shadowResource.conferenceData;
    const sourceConferenceData = eventContext.nativeConferenceData || null;
    const sourceHasCopyableConference = !!(sourceConferenceData && sourceConferenceData.signature);
    console.log(
      "Conference sync source state: sourceHasNativeConferenceData=" + eventContext.hasNativeConferenceData +
      ", sourceHasCopyableConference=" + sourceHasCopyableConference +
      ", shadowHasNativeConference=" + shadowHasNativeConference
    );

    if (!sourceHasCopyableConference && eventContext.hasNativeConferenceData) {
      console.log("Conference sync cannot copy source conference data because the signature is missing.");
      return defaultFingerprint;
    }

    if (!eventContext.hasNativeConferenceData && !shadowHasNativeConference) {
      console.log("Conference sync skipped: neither source nor shadow has native conference data.");
      return defaultFingerprint;
    }

    try {
      console.log(
        "Conference sync patching shadow event: shadowEventId=" + shadowResource.id +
        ", sourceHasNativeConferenceData=" + eventContext.hasNativeConferenceData +
        ", meetingLink=" + (eventContext.meetingLink || "none")
      );
      Calendar.Events.patch({
        conferenceData: eventContext.hasNativeConferenceData
          ? this._cloneConferenceData(eventContext.nativeConferenceData)
          : null
      }, targetCalendarId, shadowResource.id, {
        conferenceDataVersion: 1,
        sendUpdates: "none"
      });

      let persistedConferenceEvent = null;
      try {
        persistedConferenceEvent = Calendar.Events.get(targetCalendarId, shadowResource.id, {
          conferenceDataVersion: 1
        });
      } catch (readErr) {
        console.log("Conference sync verification read failed: " + readErr);
      }

      const persistedConferenceData = persistedConferenceEvent && persistedConferenceEvent.conferenceData;
      console.log(
        "Conference sync verification: targetHasConferenceData=" + !!persistedConferenceData +
        ", targetHasConferenceSignature=" + !!(persistedConferenceData && persistedConferenceData.signature)
      );

      if (!eventContext.hasNativeConferenceData || persistedConferenceData) {
        console.log("Conference sync patch completed for shadow event " + shadowResource.id);
      } else {
        console.log("Conference sync patch did not persist native conference data on the shadow event.");
      }
      return defaultFingerprint;
    } catch (err) {
      console.log("Conference patch failed: " + err);
      return shadowHasNativeConference ? undefined : defaultFingerprint;
    }
  }

  linkShadowEvent(originalEvent, shadowEvent, originalCalId, metadata) {
    const details = metadata || {};
    try { 
      shadowEvent.setTag(CONFIG.TAG_PARENT_ID, originalEvent.getId()); 
      shadowEvent.setTag(CONFIG.TAG_PARENT_CAL_ID, originalCalId);
      shadowEvent.setTag("HEADSTART_UNIVERSAL_ID", this.getUniversalEventId(originalEvent));
      shadowEvent.setTag(CONFIG.TAG_PARENT_START_MS, String(originalEvent.getStartTime().getTime()));
      shadowEvent.setTag(CONFIG.TAG_PARENT_END_MS, String(originalEvent.getEndTime().getTime()));

      if (details.minutes !== undefined && details.minutes !== null) {
        shadowEvent.setTag(CONFIG.TAG_BUFFER_MINUTES, String(details.minutes));
      }

      if (details.conferenceFingerprint !== undefined) {
        shadowEvent.setTag(CONFIG.TAG_CONFERENCE_FINGERPRINT, details.conferenceFingerprint || "");
      }
    } catch(e) {}
  }

  getParentIdFromShadow(event) {
    try { return event.getTag(CONFIG.TAG_PARENT_ID); } catch(e) { return null; }
  }

  _getShadowSearchCandidates(originalEvent) {
    if (!originalEvent) return [];
    const targetCal = this.getOrCreateHeadstartCalendar();
    if (!targetCal) return [];

    const searchStart = new Date(originalEvent.getStartTime().getTime() - (48 * 60 * 60 * 1000));
    const searchEnd = new Date(originalEvent.getEndTime().getTime() + (48 * 60 * 60 * 1000));
    return targetCal.getEvents(searchStart, searchEnd);
  }

  _looksLikeHeadstartShadow(candidate, originalEvent) {
    if (!candidate || !originalEvent) return false;

    const candidateTitle = candidate.getTitle ? (candidate.getTitle() || "") : "";
    const originalTitle = originalEvent.getTitle ? (originalEvent.getTitle() || "") : "";
    if (candidateTitle !== originalTitle) return false;

    const candidateEnd = candidate.getEndTime ? candidate.getEndTime() : null;
    const originalEnd = originalEvent.getEndTime ? originalEvent.getEndTime() : null;
    if (!candidateEnd || !originalEnd || candidateEnd.getTime() !== originalEnd.getTime()) return false;

    const candidateStart = candidate.getStartTime ? candidate.getStartTime() : null;
    const originalStart = originalEvent.getStartTime ? originalEvent.getStartTime() : null;
    if (!candidateStart || !originalStart || candidateStart.getTime() > originalStart.getTime()) return false;

    const description = candidate.getDescription ? (candidate.getDescription() || "") : "";
    return description.indexOf("Headstart Buffered Event") !== -1;
  }

  _findLinkedShadowCandidates(originalEvent) {
    const candidates = this._getShadowSearchCandidates(originalEvent);
    const matches = [];
    const universalId = this.getUniversalEventId(originalEvent);
    const googleId = originalEvent.getId();

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      let candidateUniversalId = null;
      let candidateParentId = null;
      try { candidateUniversalId = candidate.getTag("HEADSTART_UNIVERSAL_ID"); } catch (err) {}
      try { candidateParentId = candidate.getTag(CONFIG.TAG_PARENT_ID); } catch (err) {}

      if (candidateUniversalId === universalId) {
        matches.push(candidate);
        continue;
      }
      if (candidateParentId === googleId) {
        matches.push(candidate);
        continue;
      }
      if (this._looksLikeHeadstartShadow(candidate, originalEvent)) {
        matches.push(candidate);
      }
    }

    return matches;
  }

  _dedupeLinkedShadows(originalEvent, matches) {
    const candidates = matches || [];
    if (candidates.length <= 1) {
      return candidates.length ? candidates[0] : null;
    }

    candidates.sort((left, right) => {
      const leftStart = left.getStartTime ? left.getStartTime().getTime() : 0;
      const rightStart = right.getStartTime ? right.getStartTime().getTime() : 0;
      return leftStart - rightStart;
    });

    const keeper = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      try {
        candidates[i].deleteEvent();
      } catch (err) {
        console.log("Failed to delete duplicate shadow: " + err);
      }
    }
    return keeper;
  }

  findLinkedShadowEvent(originalEvent) {
    if (!originalEvent) return null;
    return this._dedupeLinkedShadows(originalEvent, this._findLinkedShadowCandidates(originalEvent));
  }

  _extractLookupHints(formInput) {
    const rawInput = formInput || {};
    return {
      apiEventId: rawInput.apiEventId || rawInput.eventApiId || "",
      recurringEventId: rawInput.recurringEventId || "",
      startTime: rawInput.eventStart || rawInput.startTime || null,
      endTime: rawInput.eventEnd || rawInput.endTime || null,
      conferenceData: this._decodeSerializedJson(rawInput.eventConferenceData || rawInput.conferenceData),
      hangoutLink: rawInput.eventHangoutLink || rawInput.hangoutLink || ""
    };
  }

  createEventContext(originalEvent, originalCalId, formInput) {
    return this.eventContextFactory.createFromEvent(
      originalEvent,
      originalCalId,
      formInput,
      this._extractLookupHints(formInput)
    );
  }

  buildShadowDescription(meetingLink, originalDescription, conferenceDetailsHtml, originalStartTime) {
    return this.shadowDescriptionBuilder.build(
      meetingLink,
      originalDescription,
      conferenceDetailsHtml,
      originalStartTime
    );
  }

  /**
   * Creates or updates the linked Headstart shadow event for a source event.
   * The workflow computes context, decides buffer length, writes the shadow,
   * syncs conference/reminder metadata, and links the two events with tags.
   */
  processEventBuffer(originalEvent, originMode, originalCalId, formInput) {
    const eventContext = this.createEventContext(originalEvent, originalCalId, formInput);
    const decision = this.bufferDecisionService.decide(
      eventContext,
      originalEvent,
      originalCalId,
      originMode,
      formInput
    );

    if (decision.skipped) {
       const existingShadow = this.findLinkedShadowEvent(originalEvent);
       if (existingShadow) existingShadow.deleteEvent();
       return { shadowStart: originalEvent.getStartTime(), minutes: 0, wasUpdate: false, skipped: true };
    }

    const bufferMinutes = decision.minutes;
    const originalStart = originalEvent.getStartTime();
    const shadowStart = new Date(originalStart.getTime() - (bufferMinutes * 60 * 1000));
    const shadowEnd = originalEvent.getEndTime(); 
    
    const description = this.buildShadowDescription(
      eventContext.meetingLink,
      eventContext.rawDescription,
      eventContext.conferenceDetailsHtml,
      originalStart
    );

    const existingShadow = this.findLinkedShadowEvent(originalEvent);
    const targetCalendar = this.getOrCreateHeadstartCalendar();
    let wasUpdate = false;
    let finalShadowEvent;
    
    if (existingShadow) {
      existingShadow.setTime(shadowStart, shadowEnd);
      existingShadow.setTitle(originalEvent.getTitle());
      existingShadow.setDescription(description);
      existingShadow.setLocation(decision.finalLocation);
      wasUpdate = true;
      finalShadowEvent = existingShadow;
    } else {
      finalShadowEvent = targetCalendar.createEvent(originalEvent.getTitle(), shadowStart, shadowEnd, {
        description: description,
        location: decision.finalLocation 
      });
    }

    if (!finalShadowEvent) {
      throw new Error("Failed to create or update the Headstart buffer event.");
    }

    const persistedShadow = this.getEventRobust(targetCalendar.getId(), finalShadowEvent.getId());
    if (!persistedShadow) {
      throw new Error("Headstart buffer event could not be verified after save.");
    }

    const appliedConferenceFingerprint = this._synchronizeShadowConferenceData(
      targetCalendar.getId(),
      persistedShadow,
      eventContext
    );

    this.linkShadowEvent(originalEvent, finalShadowEvent, originalCalId, {
      minutes: bufferMinutes,
      conferenceFingerprint: appliedConferenceFingerprint
    });
    this.linkShadowEvent(originalEvent, persistedShadow, originalCalId, {
      minutes: bufferMinutes,
      conferenceFingerprint: appliedConferenceFingerprint
    });
    this._applyShadowReminderPolicy(targetCalendar.getId(), persistedShadow);
    try { originalEvent.removeAllReminders(); } catch (err) {}
    
    return {
      shadowStart: shadowStart,
      minutes: bufferMinutes,
      wasUpdate: wasUpdate,
      shadowEventId: persistedShadow.getId ? persistedShadow.getId() : null
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { CalendarManager };
}
