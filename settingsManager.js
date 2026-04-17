/**
 * Manages fetching and saving data to PropertiesService.
 */
class AppSettings {
  constructor() {
    this.props = PropertiesService.getUserProperties();
  }

  get() {
    const raw = this.props.getProperties();
    return { 
      bufferOnline: raw['BUFFER_ONLINE'] || "true",
      onlineBuffer: raw['ONLINE_BUFFER'] || "15",
      homeAddress: raw['HOME_ADDRESS'] || "", 
      extraBuffer: raw['EXTRA_BUFFER'] || "0",
      uniName: raw['UNI_NAME'] || "",
      uniCalId: raw['UNI_CAL_ID'] || "",
      calColor: raw['CAL_COLOR'] || CalendarApp.Color.ORANGE,
      transportMode: raw['TRANSPORT_MODE'] || "DRIVING",
      walkLimit: raw['WALK_LIMIT'] || "2.0"
    };
  }

  save(formInput) {
    const onlineBufferInput = (formInput.setting_online_buffer || "").trim();
    
    this.props.setProperties({
      'BUFFER_ONLINE': formInput.setting_buffer_online || "false",
      'ONLINE_BUFFER': onlineBufferInput || "15",
      'HOME_ADDRESS': formInput.setting_home || "",
      'EXTRA_BUFFER': formInput.setting_extra || "0",
      'UNI_NAME': formInput.setting_uni_name || "",
      'UNI_CAL_ID': formInput.setting_uni_cal || "",
      'CAL_COLOR': formInput.setting_cal_color || CalendarApp.Color.ORANGE,
      'TRANSPORT_MODE': formInput.setting_transport || "DRIVING",
      'WALK_LIMIT': formInput.setting_walk_limit || "2.0"
    });
  }

  hasSeenTutorial() {
    return this.props.getProperty('ONBOARDING_COMPLETE') === 'true';
  }

  setTutorialComplete() {
    this.props.setProperty('ONBOARDING_COMPLETE', 'true');
  }

  saveCheckboxState(selectedCalIds) {
    if (!selectedCalIds) selectedCalIds = [];
    if (!Array.isArray(selectedCalIds)) selectedCalIds = [selectedCalIds];
    this.props.setProperty('SYNC_CALENDAR_IDS', JSON.stringify(selectedCalIds));
  }

  saveSyncState(selectedCalIds) {
    this.saveCheckboxState(selectedCalIds);
  }

  getSyncState() {
    const rawIds = this.props.getProperty('SYNC_CALENDAR_IDS');
    return {
      savedIds: rawIds ? JSON.parse(rawIds) : null,
      lastStatus: this.props.getProperty('LAST_SYNC_STATUS')
    };
  }

  saveSyncStatus(stats) {
    const now = new Date();
    const timeString = now.toLocaleDateString() + " " + now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let statusMsg = timeString + "\nProcessed: " + stats.processed + " | Skipped: " + stats.skipped;
    if (stats.errors > 0) statusMsg += " | Errors: " + stats.errors;
    this.props.setProperty('LAST_SYNC_STATUS', statusMsg);
  }
}

// Support local Jest testing
/* istanbul ignore next */
if (typeof module !== 'undefined') {
  module.exports = { AppSettings };
}
