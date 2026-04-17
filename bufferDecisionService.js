class BufferDecisionService {
  constructor(settings, travelEngine) {
    this.settings = settings;
    this.travelEngine = travelEngine;
  }

  decide(eventContext, originalEvent, originalCalId, originMode, options) {
    const decisionOptions = options || {};

    if (eventContext.isOnline) {
      if (this.settings.bufferOnline !== "true" && !decisionOptions.forceOnlineBuffer) {
        return { skipped: true, minutes: 0, finalLocation: eventContext.finalLocation };
      }

      let minutes = parseInt(this.settings.onlineBuffer || "15");
      if (isNaN(minutes)) minutes = 15;

      return { skipped: false, minutes: minutes, finalLocation: eventContext.finalLocation };
    }

    if (!eventContext.rawLocation) {
      return { skipped: false, minutes: 15, finalLocation: eventContext.finalLocation };
    }

    if (!this.travelEngine) {
      throw new Error("TravelEngine is required for location-based buffer decisions.");
    }

    const smartDestination = this.travelEngine.resolveSmartLocation(eventContext.rawLocation, originalCalId);
    const travelResult = this.travelEngine.calculateDynamicBuffer(
      smartDestination,
      originalEvent.getStartTime(),
      originalCalId,
      originMode
    );

    return {
      skipped: false,
      minutes: travelResult.minutes,
      finalLocation: eventContext.finalLocation
    };
  }
}

/* istanbul ignore next */
if (typeof module !== 'undefined') {
  module.exports = { BufferDecisionService };
}
