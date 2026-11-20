(function () {
/* ==========================================================================
   ZONE DATA  —  EDIT THIS FILE TO UPDATE THE EVACUATION SITES
   --------------------------------------------------------------------------
   This module is only loaded AFTER a successful WATCHER authentication.

   image / imageFull
     - Put your own photo in /images (e.g. "images/zone01.jpg") and set the
       path here. Each zone is replaced independently.
     - While `image` is null, a live Esri World Imagery capture centred on the
       zone coordinates is used as a stand-in.
     - `imageFull` (optional) is the large photo shown in the viewer.
       If omitted, `image` is reused.

   lat / lon / lastObserved / fieldCondition / extractionStatus / analysis
     - ALL VALUES BELOW ARE PLACEHOLDERS. They are not confirmed locations or
       field reports. Replace them with real data when it is available.
     - lastObserved: null shows the live UTC clock; or set any text/timestamp.
   ========================================================================== */

// Target of the orbital zoom sequence (New York City).
const TARGET = {
  name: 'NEW YORK, UNITED STATES',
  lat: 40.7128,
  lon: -74.006,
};

const ZONES = [
  {
    id: 'ZONE 01',
    name: 'EVACUATION SITE A',
    lat: 40.7829,
    lon: -73.9654,
    image: 'images/zone01.jpg',
    imageFull: null,
    lastObserved: null,
    fieldCondition: 'AWAITING FIELD REPORT',
    extractionStatus: 'PENDING VERIFICATION',
    analysis: [
      'PLACEHOLDER ENTRY. NO VERIFIED ANALYSIS AVAILABLE.',
      'OPEN AREA DETECTED WITHIN SURVEILLANCE FOOTPRINT.',
      'REPLACE THIS TEXT IN js/zones.js.',
    ],
  },
  {
    id: 'ZONE 02',
    name: 'EVACUATION SITE B',
    lat: 40.7061,
    lon: -74.016,
    image: 'images/zone02.jpg',
    imageFull: null,
    lastObserved: null,
    fieldCondition: 'AWAITING FIELD REPORT',
    extractionStatus: 'PENDING VERIFICATION',
    analysis: [
      'PLACEHOLDER ENTRY. NO VERIFIED ANALYSIS AVAILABLE.',
      'WATERFRONT ACCESS DETECTED WITHIN SURVEILLANCE FOOTPRINT.',
      'REPLACE THIS TEXT IN js/zones.js.',
    ],
  },
  {
    id: 'ZONE 03',
    name: 'EVACUATION SITE C',
    lat: 40.6892,
    lon: -73.9442,
    image: 'images/zone03.jpg',
    imageFull: null,
    lastObserved: null,
    fieldCondition: 'AWAITING FIELD REPORT',
    extractionStatus: 'PENDING VERIFICATION',
    analysis: [
      'PLACEHOLDER ENTRY. NO VERIFIED ANALYSIS AVAILABLE.',
      'URBAN CLEARING DETECTED WITHIN SURVEILLANCE FOOTPRINT.',
      'REPLACE THIS TEXT IN js/zones.js.',
    ],
  },
];

window.ZONES_DATA = ZONES;
})();
