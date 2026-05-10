/**
 * Runs scheduled and manual syncs for selected calendars.
 * Also prunes stale Headstart shadow events.
 */
class SyncEngine {
  constructor(appSettings, calManager) {
    this.appSettings = appSettings;
    this.calManager = calManager;
  }

  /**
   * Installs the daily Apps Script trigger once, avoiding duplicate scheduled runs.
   */
  installDailyTrigger() {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'runBackgroundSync') return;
    }
    ScriptApp.newTrigger('runBackgroundSync').timeBased().everyDays(1).create();
  }

  /**
   * Runs the saved background sync configuration, if the user has selected calendars.
   */
  runBackgroundSync() {
    const syncState = this.appSettings.getSyncState();
    if (syncState.savedIds) {
      const stats = this.runSyncEngine(syncState.savedIds);
      this.appSettings.saveSyncStatus(stats);
    }
  }

  _readTagNumber(event, tagName) {
    if (!event || !tagName) return null;

    try {
      const rawValue = event.getTag(tagName);
      if (rawValue === null || rawValue === "") return null;

      const parsedValue = parseInt(rawValue, 10);
      return isNaN(parsedValue) ? null : parsedValue;
    } catch (err) {
      return null;
    }
  }

  _readTagValue(event, tagName) {
    if (!event || !tagName) return "";

    try {
      return event.getTag(tagName) || "";
    } catch (err) {
      return "";
    }
  }

  /**
   * Removes Headstart shadow events whose source event is missing or no longer
   * matches the expected time window.
   */
  pruneOrphanedShadows() {
    const targetCal = this.calManager.getOrCreateHeadstartCalendar();
    const now = new Date();
    
    const searchStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    const searchEnd = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));
    
    const shadows = targetCal.getEvents(searchStart, searchEnd);
    let pruned = 0;

    for (let i = 0; i < shadows.length; i++) {
      const shadow = shadows[i];
      const parentId = this.calManager.getParentIdFromShadow(shadow);
      const parentCalId = shadow.getTag(CONFIG.TAG_PARENT_CAL_ID);
      
      if (!parentId || !parentCalId) continue; 

      const parentEvent = this.calManager.getEventRobust(parentCalId, parentId);
      let shouldDelete = false;

      if (!parentEvent) {
        shouldDelete = true; 
      } else {
        const timeDiffHours = Math.abs(parentEvent.getStartTime().getTime() - shadow.getStartTime().getTime()) / (1000 * 60 * 60);
        if (timeDiffHours > 24) {
          shouldDelete = true;
        }
      }

      if (shouldDelete) {
        try {
          shadow.deleteEvent();
          pruned++;
        } catch(e) { console.log("Failed to prune orphan: " + e); }
      }
    }
    return pruned;
  }

  /**
   * Recalculates buffers for upcoming events across selected calendars.
   * Existing shadows are refreshed only when source details have changed.
   */
  runSyncEngine(calendarIds) {
    const prunedCount = this.pruneOrphanedShadows();
    console.log(`Garbage Collection: Pruned ${prunedCount} orphaned shadow events.`);

    const now = new Date();
    const end = new Date(now.getTime() + (CONFIG.BATCH_DAYS * 24 * 60 * 60 * 1000));
    let stats = { processed: 0, skipped: 0, errors: 0, pruned: prunedCount };

    for (let c = 0; c < calendarIds.length; c++) {
      const calId = calendarIds[c];
      try {
        const calendar = CalendarApp.getCalendarById(calId);
        if (!calendar) continue;

        const events = calendar.getEvents(now, end);
        
        for (let i = 0; i < events.length; i++) {
          Utilities.sleep(200); 

          const ev = events[i];
          
          if (ev.isAllDayEvent() || 
              ev.getMyStatus() === CalendarApp.GuestStatus.NO || 
              ev.getTitle().indexOf(CONFIG.CALENDAR_NAME + ":") === 0 || 
              this.calManager.getParentIdFromShadow(ev)) { 
            stats.skipped++; 
            continue; 
          }

          const existingShadow = this.calManager.findLinkedShadowEvent(ev);
          const eventContext = this.calManager.createEventContext(ev, calId);

          if (existingShadow) {
            const locationChanged = existingShadow.getLocation() !== eventContext.shadowLocation;
            const titleChanged = existingShadow.getTitle() !== ev.getTitle();
            const taggedStartMs = this._readTagNumber(existingShadow, CONFIG.TAG_PARENT_START_MS);
            const taggedEndMs = this._readTagNumber(existingShadow, CONFIG.TAG_PARENT_END_MS);
            const taggedConferenceFingerprint = this._readTagValue(existingShadow, CONFIG.TAG_CONFERENCE_FINGERPRINT);
            const startChanged = taggedStartMs === null || taggedStartMs !== ev.getStartTime().getTime();
            const endChanged = taggedEndMs === null || taggedEndMs !== ev.getEndTime().getTime();
            const conferenceChanged = taggedConferenceFingerprint !== (eventContext.conferenceFingerprint || "");

            if (locationChanged || titleChanged || startChanged || endChanged || conferenceChanged) {
              console.log("Event modified. Recalculating buffer for: " + ev.getTitle());
              try {
                this.calManager.processEventBuffer(ev, "AUTO", calId);
                stats.processed++;
              } catch(e) { 
                stats.errors++; 
              }
            } else {
              stats.skipped++; 
            }
            continue; 
          }

          try {
            this.calManager.processEventBuffer(ev, "AUTO", calId);
            stats.processed++;
          } catch (err) {
            console.log("Batch Error: " + err);
            stats.errors++;
          }
        }
      } catch(e) {
        console.log("Calendar Access Error: " + e);
      }
    }
    return stats;
  }
}

/* istanbul ignore next */
if (typeof module !== 'undefined') {
  module.exports = { SyncEngine };
}
