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

  _toPlainText(value) {
    if (!value) return "";

    return String(value)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<li>/gi, "- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, "\"")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  build(meetingLink, originalDescription, conferenceDetailsHtml, originalStartTime) {
    const formattedOriginalStart = this._formatOriginalStart(originalStartTime);
    const plainConferenceDetails = this._toPlainText(conferenceDetailsHtml);
    const plainOriginalDescription = this._toPlainText(originalDescription);
    let description = "Headstart Buffered Event\n" +
      "------------------------";

    if (formattedOriginalStart) {
      description += "\n\nOriginal Start Time: " + formattedOriginalStart;
    }

    if (plainConferenceDetails) {
      description += "\n\nConferencing Details:\n" + plainConferenceDetails;
    } else if (meetingLink) {
      description += "\n\nMeeting Link: " + meetingLink;
    }

    if (plainOriginalDescription) {
      description += "\n\nOriginal Event Notes:\n" + plainOriginalDescription;
    }

    return description;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { ShadowDescriptionBuilder };
}
