/**
 *  BufferDecisionService applies the rules that decide whether an event should receive a buffer
 * and how many minutes that buffer should contain.
 */
class BufferDecisionService {
  constructor(settings, travelEngine) {
    this.settings = settings;
    this.travelEngine = travelEngine;
  }

  /**
   * Chooses between online fixed buffers, skipped online events, and dynamic
   * travel-based buffers for physical events.
   */
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
      originMode,
      decisionOptions.customOriginLocation || ""
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
