class ConferenceDetailsService {
  getForEvent(calendarId, event, lookupHints) {
    const lookupRequest = this._buildLookupRequest(event, lookupHints);
    const fallbackDetails = this._buildFallbackConferenceDetails(lookupRequest);
    console.log(
      "Conference lookup start: calendarId=" + calendarId +
      ", apiEventId=" + (lookupRequest.apiEventId || "none") +
      ", iCalUID=" + (lookupRequest.iCalUID || "none") +
      ", fallbackMeetingLink=" + (fallbackDetails.meetingLink || "none")
    );
    if (typeof Calendar === "undefined" || !calendarId || !event || !event.getId) {
      console.log("Conference lookup using fallback only.");
      return fallbackDetails;
    }

    const eventData = this.findAdvancedEvent(
      calendarId,
      lookupRequest
    );
    if (!eventData) {
      console.log("Conference lookup advanced fetch missed. Using fallback details.");
      return fallbackDetails;
    }

    const advancedDetails = this._extractConferenceDetails(eventData);
    const finalDetails = this._hasConferenceContent(advancedDetails) ? advancedDetails : fallbackDetails;
    console.log(
      "Conference lookup result: source=" + (finalDetails === advancedDetails ? "advanced" : "fallback") +
      ", meetingLink=" + (finalDetails.meetingLink || "none") +
      ", hasNativeConferenceData=" + finalDetails.hasNativeConferenceData
    );
    return finalDetails;
  }

  findAdvancedEvent(calendarId, lookup) {
    if (typeof Calendar === "undefined" || !Calendar.Events || !calendarId) return null;

    const request = lookup || {};
    const directEventId = request.apiEventId || request.eventId || "";
    const fromDirectGet = this._getAdvancedEventById(calendarId, directEventId);
    if (fromDirectGet) return fromDirectGet;

    const iCalUid = request.iCalUID || request.iCalUid || "";
    const fromICalLookup = this._findEventByICalUid(calendarId, iCalUid, request);
    if (fromICalLookup) return fromICalLookup;

    const recurringEventId = request.recurringEventId || "";
    const fromRecurringLookup = this._findRecurringInstance(calendarId, recurringEventId, request);
    if (fromRecurringLookup) return fromRecurringLookup;

    return null;
  }

  buildConferenceFingerprint(value) {
    if (!value) return "";
    return this._hashString(this._stableStringify(value));
  }

  _emptyConferenceDetails() {
    return {
      meetingLink: "",
      detailsHtml: "",
      nativeConferenceData: null,
      hasNativeConferenceData: false,
      conferenceFingerprint: "",
      advancedEventId: ""
    };
  }

  _hasConferenceContent(details) {
    return !!(details && (details.meetingLink || details.detailsHtml || details.hasNativeConferenceData));
  }

  _buildFallbackConferenceDetails(lookup) {
    const request = lookup || {};
    const conferenceData = request.conferenceData || null;
    const hangoutLink = request.hangoutLink || "";

    if (!conferenceData && !hangoutLink) {
      return this._emptyConferenceDetails();
    }

    const details = this._extractConferenceDetails({
      conferenceData: conferenceData,
      hangoutLink: hangoutLink,
      id: request.apiEventId || request.iCalUID || ""
    });

    if (!this._isCopyableConferenceData(details.nativeConferenceData)) {
      details.nativeConferenceData = null;
      details.hasNativeConferenceData = false;
    }

    if (!details.conferenceFingerprint) {
      details.conferenceFingerprint = this.buildConferenceFingerprint(
        conferenceData || (details.meetingLink ? { meetingLink: details.meetingLink } : null)
      );
    }

    return details;
  }

  _buildLookupRequest(event, lookupHints) {
    const hints = lookupHints || {};

    return {
      apiEventId: hints.apiEventId || hints.eventId || "",
      iCalUID: hints.iCalUID || hints.iCalUid || (event.getId ? event.getId() : ""),
      recurringEventId: hints.recurringEventId || "",
      startTime: this._normalizeTime(hints.startTime || (event.getStartTime ? event.getStartTime() : null)),
      endTime: this._normalizeTime(hints.endTime || (event.getEndTime ? event.getEndTime() : null)),
      conferenceData: hints.conferenceData || null,
      hangoutLink: hints.hangoutLink || ""
    };
  }

  _isCopyableConferenceData(conferenceData) {
    return !!(conferenceData && conferenceData.signature);
  }

  _getAdvancedEventById(calendarId, eventId) {
    if (!eventId) return null;

    try {
      return Calendar.Events.get(calendarId, eventId, {
        conferenceDataVersion: 1
      });
    } catch (err) {
      return null;
    }
  }

  _findEventByICalUid(calendarId, iCalUid, lookup) {
    if (!iCalUid || !Calendar.Events || !Calendar.Events.list) return null;

    try {
      const timeBounds = this._getEventTimeBounds(lookup);
      const response = Calendar.Events.list(calendarId, {
        iCalUID: iCalUid,
        singleEvents: true,
        timeMin: timeBounds.timeMin,
        timeMax: timeBounds.timeMax,
        conferenceDataVersion: 1
      });
      const items = response && response.items ? response.items : [];
      if (!items.length) return null;

      const matchedEvent = this._findBestTimeMatch(items, lookup);
      return matchedEvent || items[0];
    } catch (err) {
      return null;
    }
  }

  _findRecurringInstance(calendarId, recurringEventId, lookup) {
    if (!recurringEventId || !Calendar.Events || !Calendar.Events.instances) return null;

    try {
      const timeBounds = this._getEventTimeBounds(lookup);
      const response = Calendar.Events.instances(calendarId, recurringEventId, {
        timeMin: timeBounds.timeMin,
        timeMax: timeBounds.timeMax,
        conferenceDataVersion: 1
      });
      const items = response && response.items ? response.items : [];
      if (!items.length) return null;

      const matchedEvent = this._findBestTimeMatch(items, lookup);
      return matchedEvent || items[0];
    } catch (err) {
      return null;
    }
  }

  _findBestTimeMatch(items, lookup) {
    const targetStart = this._normalizeTime(lookup && lookup.startTime);
    const targetEnd = this._normalizeTime(lookup && lookup.endTime);
    if (!targetStart || !targetEnd) return null;

    const targetStartMs = targetStart.getTime();
    const targetEndMs = targetEnd.getTime();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemStartMs = this._readEventDateMs(item.start);
      const itemEndMs = this._readEventDateMs(item.end);

      if (itemStartMs === targetStartMs && itemEndMs === targetEndMs) {
        return item;
      }
    }

    return null;
  }

  _getEventTimeBounds(lookup) {
    const startTime = this._normalizeTime(lookup && lookup.startTime);
    const endTime = this._normalizeTime(lookup && lookup.endTime);
    if (!startTime || !endTime) {
      return {
        timeMin: undefined,
        timeMax: undefined
      };
    }

    return {
      timeMin: new Date(startTime.getTime() - 60000).toISOString(),
      timeMax: new Date(endTime.getTime() + 60000).toISOString()
    };
  }

  _normalizeTime(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "string") {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    if (value.dateTime || value.date) {
      return this._normalizeTime(value.dateTime || value.date);
    }
    return null;
  }

  _readEventDateMs(eventDate) {
    const parsed = this._normalizeTime(eventDate);
    return parsed ? parsed.getTime() : null;
  }

  _extractConferenceDetails(eventData) {
    const entryPoints = eventData.conferenceData && eventData.conferenceData.entryPoints
      ? eventData.conferenceData.entryPoints
      : [];

    const videoEntry = this._findPreferredVideoEntry(entryPoints);
    const fallbackUri = eventData.hangoutLink || this._findFirstUri(entryPoints);
    const meetingLink = videoEntry ? videoEntry.uri : (fallbackUri || "");
    const nativeConferenceData = eventData.conferenceData
      ? this._cloneConferenceData(eventData.conferenceData)
      : null;
    const conferenceFingerprint = this.buildConferenceFingerprint(
      nativeConferenceData || (meetingLink ? { meetingLink: meetingLink } : null)
    );

    const lines = [];
    for (let i = 0; i < entryPoints.length; i++) {
      const line = this._formatEntryPoint(entryPoints[i]);
      if (line) lines.push(line);
    }

    if (!lines.length && meetingLink) {
      lines.push("Video: <a href='" + meetingLink + "'>" + meetingLink + "</a>");
    }

    return {
      meetingLink: meetingLink,
      detailsHtml: lines.join("<br>"),
      nativeConferenceData: nativeConferenceData,
      hasNativeConferenceData: !!nativeConferenceData,
      conferenceFingerprint: conferenceFingerprint,
      advancedEventId: eventData.id || ""
    };
  }

  _cloneConferenceData(conferenceData) {
    return JSON.parse(JSON.stringify(conferenceData));
  }

  _stableStringify(value) {
    if (value === null || value === undefined) return "null";
    if (Array.isArray(value)) {
      return "[" + value.map((item) => this._stableStringify(item)).join(",") + "]";
    }
    if (typeof value === "object") {
      const keys = Object.keys(value).sort();
      const parts = [];
      for (let i = 0; i < keys.length; i++) {
        parts.push(JSON.stringify(keys[i]) + ":" + this._stableStringify(value[keys[i]]));
      }
      return "{" + parts.join(",") + "}";
    }
    return JSON.stringify(value);
  }

  _hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  _findPreferredVideoEntry(entryPoints) {
    for (let i = 0; i < entryPoints.length; i++) {
      if (entryPoints[i].entryPointType === "video" && entryPoints[i].uri) {
        return entryPoints[i];
      }
    }
    return null;
  }

  _findFirstUri(entryPoints) {
    for (let i = 0; i < entryPoints.length; i++) {
      if (entryPoints[i].uri) {
        return entryPoints[i].uri;
      }
    }
    return "";
  }

  _formatEntryPoint(entryPoint) {
    if (!entryPoint) return "";

    const label = this._getEntryPointLabel(entryPoint.entryPointType);
    const parts = [];

    if (entryPoint.uri) {
      parts.push(label + ": <a href='" + entryPoint.uri + "'>" + entryPoint.uri + "</a>");
    } else if (entryPoint.label) {
      parts.push(label + ": " + entryPoint.label);
    }

    if (entryPoint.pin) parts.push("PIN: " + entryPoint.pin);
    if (entryPoint.accessCode) parts.push("Access code: " + entryPoint.accessCode);
    if (entryPoint.passcode) parts.push("Passcode: " + entryPoint.passcode);
    if (entryPoint.password) parts.push("Password: " + entryPoint.password);
    if (entryPoint.meetingCode) parts.push("Meeting code: " + entryPoint.meetingCode);

    return parts.join(" | ");
  }

  _getEntryPointLabel(entryPointType) {
    if (entryPointType === "video") return "Video";
    if (entryPointType === "phone") return "Phone";
    if (entryPointType === "sip") return "SIP";
    if (entryPointType === "more") return "More";
    return "Conference";
  }
}

if (typeof module !== "undefined") {
  module.exports = { ConferenceDetailsService };
}
