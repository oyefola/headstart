/**
 * Handles all Google Maps API interactions and math.
 */
class TravelEngine {
  constructor(settings) {
    this.settings = settings;
  }

  resolveSmartLocation(rawLocation, currentCalendarId) {
    let searchTerm = rawLocation;
    if (rawLocation.indexOf(',') !== -1) {
      searchTerm = rawLocation.split(',')[0].trim();
    }

    if (currentCalendarId === this.settings.uniCalId && this.settings.uniName && this.settings.uniName.length > 0) {
      return searchTerm + ", " + this.settings.uniName;
    }

    if (!this.settings.homeAddress) return rawLocation;

    try {
      const homeGeo = Maps.newGeocoder().geocode(this.settings.homeAddress);
      if (homeGeo.status !== 'OK') return rawLocation;
      const homeLat = homeGeo.results[0].geometry.location.lat;
      const homeLng = homeGeo.results[0].geometry.location.lng;

      const searchResults = Maps.newGeocoder().geocode(searchTerm);
      if (searchResults.status !== 'OK') return rawLocation;

      let closestMatch = rawLocation;
      let minDistance = 99999999;

      for (let i = 0; i < searchResults.results.length; i++) {
        const result = searchResults.results[i];
        const resLat = result.geometry.location.lat;
        const resLng = result.geometry.location.lng;
        const dist = this._getDistanceFromLatLonInKm(homeLat, homeLng, resLat, resLng);
        if (dist < minDistance) {
          minDistance = dist;
          closestMatch = result.formatted_address; 
        }
      }
      if (minDistance > 100) return rawLocation;
      return closestMatch;

    } catch (e) {
      return rawLocation; 
    }
  }

  calculateDynamicBuffer(destination, eventStartTime, calendarId, originMode, customOriginLocation) {
    if (!this.settings.homeAddress) {
        return { minutes: 15, log: "Error: No Home Address Set", originUsed: "None" };
    }

    let originAddress = this.settings.homeAddress;
    let isHome = true;
    let originLog = "Home";

    if (originMode === "CUSTOM" && customOriginLocation) {
      originAddress = customOriginLocation;
      isHome = false;
      originLog = "Custom";
    } else if (originMode === "HOME") { 
      originAddress = this.settings.homeAddress; 
    } else if (originMode === "PREVIOUS") {
      const prev = this.findPreviousEventLocation(eventStartTime, calendarId);
      if (prev) { originAddress = prev; isHome = false; originLog = "Previous Event"; }
      else { originLog = "Prev Not Found -> Home"; }
    } else { 
      const prev = this.findPreviousEventLocation(eventStartTime, calendarId);
      if (prev) { originAddress = prev; isHome = false; originLog = "Auto (Context)"; }
      else { originLog = "Auto (Home)"; }
    }

    if (!isHome) {
      const rawOrigin = originAddress;
      originAddress = this.resolveSmartLocation(rawOrigin, calendarId);
      if (originAddress !== rawOrigin) originLog += " (Resolved)";
    }

    let modeUsed = "Walking";
    
    // FIX 1: Changed setArrivalTime to setArrive
    let finalDirections = Maps.newDirectionFinder()
      .setOrigin(originAddress)
      .setDestination(destination)
      .setMode(Maps.DirectionFinder.Mode.WALKING)
      .setArrive(eventStartTime) 
      .getDirections();

    let useWalking = false;
    const walkLimit = parseFloat(this.settings.walkLimit) || 2.0; 

    if (finalDirections.status === "OK" && finalDirections.routes.length > 0) {
       const leg = finalDirections.routes[0].legs[0];
       const distanceKm = leg.distance.value / 1000;
       if (distanceKm <= walkLimit) useWalking = true;
    }

    if (!useWalking) {
       const transportMode = (this.settings.transportMode === "TRANSIT") ? Maps.DirectionFinder.Mode.TRANSIT : Maps.DirectionFinder.Mode.DRIVING;
       modeUsed = (this.settings.transportMode === "TRANSIT") ? "Public Transit" : "Driving";
       
       // FIX 2: Changed setArrivalTime to setArrive
       finalDirections = Maps.newDirectionFinder()
          .setOrigin(originAddress)
          .setDestination(destination)
          .setMode(transportMode)
          .setArrive(eventStartTime)
          .getDirections();
       
       if ((finalDirections.status !== "OK" || finalDirections.routes.length === 0) && modeUsed === "Public Transit") {
           modeUsed = "Driving (Transit Failed)";
           
           // FIX 3: Changed setArrivalTime to setArrive
           finalDirections = Maps.newDirectionFinder()
             .setOrigin(originAddress)
             .setDestination(destination)
             .setMode(Maps.DirectionFinder.Mode.DRIVING)
             .setArrive(eventStartTime)
             .getDirections();
       }
    }

    if (finalDirections.status !== "OK" || finalDirections.routes.length === 0) {
        return { minutes: 45, log: "Map Error / No Route", originUsed: originLog };
    }

    const leg = finalDirections.routes[0].legs[0];
    const distanceKm = leg.distance.value / 1000;
    const durationMins = leg.duration.value / 60;

    let multiplier = 1.0;
    if (modeUsed === "Public Transit") multiplier = 1.15; 
    if (modeUsed === "Driving" && isHome && durationMins > 30) multiplier = 1.25;

    const weightedDuration = durationMins * multiplier;
    const safetyBuffer = (weightedDuration < 10) ? 5 : 15; 
    const userExtra = parseInt(this.settings.extraBuffer) || 0;
    const totalTime = weightedDuration + safetyBuffer + userExtra;
    
    return { 
      minutes: Math.ceil(totalTime), 
      log: modeUsed + " (" + distanceKm.toFixed(1) + "km)", 
      originUsed: originLog
    };
  }

  findPreviousEventLocation(targetStartTime, calendarId) {
    const twoHoursBefore = new Date(targetStartTime.getTime() - (2 * 60 * 60 * 1000));
    const calendar = CalendarApp.getCalendarById(calendarId);
    
    // FIX: Add a defensive check to prevent crashes if the calendar is inaccessible
    if (!calendar) return null; 
    
    const events = calendar.getEvents(twoHoursBefore, targetStartTime);
    if (events.length > 0) {
      const prevEvent = events[events.length - 1];
      const loc = prevEvent.getLocation();
      if (loc && !loc.includes("Zoom") && !loc.includes("Teams")) return loc;
    }
    return null;
  }

  // Private Helper
  _getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = this._deg2rad(lat2-lat1);
    const dLon = this._deg2rad(lon2-lon1); 
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(this._deg2rad(lat1)) * Math.cos(this._deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
  }

  _deg2rad(deg) { 
    return deg * (Math.PI/180); 
  }
}

 
if (typeof module !== 'undefined') {
  module.exports = { TravelEngine };
}
