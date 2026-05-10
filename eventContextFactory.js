/* istanbul ignore next */
function createConferenceDetailsService() {
  if (typeof ConferenceDetailsService !== 'undefined') {
    return new ConferenceDetailsService();
  }
  if (typeof require !== 'undefined') {
    return new (require("./conferenceDetailsService.js").ConferenceDetailsService)();
  }
  return {
    getForEvent: function() {
      return { meetingLink: "", detailsHtml: "" };
    }
  };
}

/**
 * Normalizes a raw Calendar event into the context Headstart needs for decisions:
 * physical location, meeting link, native conference data, and attendance mode.
 */
class EventContextFactory {
  constructor(conferenceDetailsService) {
    this.meetingRegex = /(https?:\/\/(?:[\w-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com|chime\.aws)[^\s"<>]+)/i;
    this.conferenceDetailsService = conferenceDetailsService || createConferenceDetailsService();
  }

  /**
   * Builds a normalized event context from CalendarApp fields, Advanced Calendar
   * conference details, and any manual user override from the add-on UI.
   */
  createFromEvent(event, calendarId, formInput, lookupHints) {
    const manualOptions = formInput || {};
    const attendanceMode = manualOptions.attendanceMode || "";
    const eventLocation = event.getLocation() || "";
    let rawLocation = eventLocation;
    const rawDescription = event.getDescription() || "";
    const advancedConferenceDetails = this.conferenceDetailsService.getForEvent(calendarId, event, lookupHints);
    const manualResolvedLocation = manualOptions.resolvedManualLocation || "";

    if (attendanceMode === "physical" && manualResolvedLocation) {
      rawLocation = manualResolvedLocation;
    } else if (!rawLocation && manualResolvedLocation) {
      rawLocation = manualResolvedLocation;
    }

    const detectedMeetingLink = advancedConferenceDetails.meetingLink || this.extractMeetingLink(eventLocation, rawDescription);
    const manualMeetingLink = attendanceMode === "online" ? manualResolvedLocation : "";
    const meetingLink = manualMeetingLink || detectedMeetingLink;
    const normalizedLocation = rawLocation.toLowerCase();
    const locationIsMeetingLink = this.isMeetingLink(rawLocation);
    const hasPhysicalLocation = !!rawLocation && !locationIsMeetingLink;
    const inferredIsOnline = hasPhysicalLocation
      ? false
      : (
          !!meetingLink ||
          normalizedLocation.includes("zoom") ||
          normalizedLocation.includes("teams") ||
          normalizedLocation.includes("meet")
        );
    const isOnline = attendanceMode === "physical"
      ? false
      : (attendanceMode === "online" ? true : inferredIsOnline);
    const hasNativeConferenceData = !!advancedConferenceDetails.hasNativeConferenceData;
    const shadowLocation = hasNativeConferenceData
      ? (isOnline ? "" : rawLocation)
      : ((isOnline && meetingLink) ? meetingLink : rawLocation);
    const conferenceFingerprint = advancedConferenceDetails.conferenceFingerprint ||
      (meetingLink && this.conferenceDetailsService.buildConferenceFingerprint
        ? this.conferenceDetailsService.buildConferenceFingerprint({ meetingLink: meetingLink })
        : (meetingLink || ""));

    console.log(
      "Event context conference summary: rawLocation=" + (rawLocation || "none") +
      ", meetingLink=" + (meetingLink || "none") +
      ", hasNativeConferenceData=" + hasNativeConferenceData +
      ", isOnline=" + isOnline
    );

    return {
      rawLocation: rawLocation,
      rawDescription: rawDescription,
      meetingLink: meetingLink,
      conferenceDetailsHtml: advancedConferenceDetails.detailsHtml,
      nativeConferenceData: advancedConferenceDetails.nativeConferenceData,
      hasNativeConferenceData: hasNativeConferenceData,
      conferenceFingerprint: conferenceFingerprint,
      isOnline: isOnline,
      hasPhysicalLocation: hasPhysicalLocation,
      finalLocation: shadowLocation,
      shadowLocation: shadowLocation
    };
  }

  extractMeetingLink(rawLocation, rawDescription) {
    const locationMatch = rawLocation.match(this.meetingRegex);
    if (locationMatch) return locationMatch[0];

    const descriptionMatch = rawDescription.match(this.meetingRegex);
    if (descriptionMatch) return descriptionMatch[0];

    return "";
  }

  isMeetingLink(value) {
    if (!value) return false;
    return this.meetingRegex.test(value);
  }
}

/* istanbul ignore next */
if (typeof module !== 'undefined') {
  module.exports = { EventContextFactory };
}
