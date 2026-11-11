/*
  LRMS-HIVE configuration
  ------------------------------------------------------------
  API_URL: paste the Web App URL from Apps Script
           (Deploy > New deployment > Web app > copy URL ending in /exec).
  Leave it empty ("") to run in DEMO MODE: the site uses built-in sample
  data and saves admin edits only in this browser (demo password: demo).
*/
window.HIVE_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxLmhdkG7pvm-Md4LIzkwptkmuBu7fRR81JEAkZ4cI3cj6X8e7zxudZ3s_dOiO1a09N/exec",
  APP_VERSION: "1.8.0",
  // How long (minutes) the site trusts its saved copy before refreshing in the background.
  CACHE_MINUTES: 10
};
