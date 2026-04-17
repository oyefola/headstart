class ShadowDescriptionBuilder {
  _getTimeZone() {
    try {
      if (typeof Session !== "undefined" && Session.getScriptTimeZone) {
        return Session.getScriptTimeZone() || "Etc/UTC";
      }
    } catch (err) {}

    return "Etc/UTC";
  }

  _formatOriginalStart(originalStartTime) {
    if (!originalStartTime) return "";

    const startDate = originalStartTime instanceof Date
      ? originalStartTime
      : new Date(originalStartTime);

    if (isNaN(startDate.getTime())) return "";

    if (typeof Utilities !== "undefined" && Utilities.formatDate) {
      const timeZone = this._getTimeZone();
      return Utilities.formatDate(startDate, timeZone, "EEE, dd MMM yyyy 'at' HH:mm");
    }

    const weekday = startDate.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
    const datePart = startDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    });
    const timePart = startDate.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC"
    });

    return weekday + ", " + datePart + " at " + timePart;
  }

  build(meetingLink, originalDescription, conferenceDetailsHtml, originalStartTime) {
    const formattedOriginalStart = this._formatOriginalStart(originalStartTime);
    let description = "<b>Headstart Buffered Event</b><br>" +
      "--------------------------------<br>" +
      "This event was created by Headstart to protect the time before your linked event.";

    if (formattedOriginalStart) {
      description += "<br><br><b>Original Start Time:</b> " + formattedOriginalStart;
    }

    if (conferenceDetailsHtml) {
      description += "<br><br><b>Conferencing Details:</b><br>" + conferenceDetailsHtml;
    } else if (meetingLink) {
      description += "<br><br>🎥 <b>Meeting Link:</b> <a href='" + meetingLink + "'>" + meetingLink + "</a>";
    }

    if (originalDescription && originalDescription.trim()) {
      description += "<br><br><b>Original Event Notes:</b><br>" + originalDescription;
    }

    return description;
  }
}

/* istanbul ignore next */
if (typeof module !== 'undefined') {
  module.exports = { ShadowDescriptionBuilder };
}
