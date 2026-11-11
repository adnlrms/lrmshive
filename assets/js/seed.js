/*
  Default settings + starter content.
  The live site reads everything from Google Sheets; this file is only used
  (1) in demo mode and (2) as the starter content the backend's setup() writes
  to your Sheet the first time. Items marked sample:true have no link yet.
*/
window.HIVE_DEFAULT_SETTINGS = {
  siteName: "LRMS-HIVE",
  siteTagline: "Hub for Innovation and Versatile materials for Education",
  orgName: "SDO Agusan del Norte | Learning Resource Management Section",
  logoUrl: "",
  logoSize: "md",
  logoFrame: "none",
  logoBg: "none",
  logo2Url: "",
  logoAsIcon: true,
  welcomeTitle: "Your learning resources, one tap away.",
  welcomeText: "Lessons, guidelines, e-books, learning apps and templates from the LRMS of the Division of Agusan del Norte. Tap a tile to open it, or press Search and type what you need.",
  entryEnabled: true,
  entryTitle: "Welcome to LRMS-HIVE",
  entryText: "Help us know where LRMS-HIVE has reached. Please share a few details before you continue — this is asked only once on this device.",
  entryButton: "Enter LRMS-HIVE",
  entryUppercase: true,
  privacyText: "In compliance with the Data Privacy Act of 2012 (Republic Act No. 10173), the Learning Resource Management Section collects your name, school, district and division only to count and describe the users of this site, to see which learning resources are used and found helpful, and to plan learning resource support for schools.\n\nYour details are stored in a Google Sheet that only authorized LRMS personnel can open. They are not sold, published or shared outside the Department of Education. You may ask the LRMS to correct or delete your record by writing to the contact address at the bottom of this site.",
  footer: {
    orgLines: ["Department of Education", "Caraga Region · Division of Agusan del Norte", "Learning Resource Management Section"],
    contacts: [
      { icon: "mail", label: "agnor.lrmc@gmail.com", url: "mailto:agnor.lrmc@gmail.com" },
      { icon: "web", label: "www.depedagnor.com", url: "https://www.depedagnor.com" }
    ],
    links: [],
    note: "Materials on this site are for educational use of DepEd personnel and learners."
  },
  groups: [],
  newsTitle: "News and Updates",
  newsIntro: "Activities, trainings and achievements of the Learning Resource Management Section.",
  newsOnHome: 3,
  facebookPageUrl: "",
  showFbFeed: true,
  bgHome: "", bgHomeStyle: "top", bgHomeStrength: "medium", bgHomeTint: true,
  bgGate: "", bgGateStyle: "vignette", bgGateStrength: "medium", bgGateTint: true,
  bgPages: "", bgPagesStyle: "corner", bgPagesStrength: "subtle", bgPagesTint: true,
  mapTitle: "Library Map",
  mapIntro: "Where the school libraries and Library Hubs are, which schools they reach, and which schools still need library access and learning resources.",
  mapCenter: "9.08, 125.48",
  mapZoom: 10,
  mapTiles: "osm",
  libRadiusKm: 1,
  hubRadiusKm: 10,
  mapColors: { hub: "#E09D00", library: "#2F7D5B", covered: "#1F6FA8", need: "#C0392B", lrLacking: "#D9822B" },
  mapRipple: true,
  eventsOnHome: 4,
  reminderDays: 3,
  showClock: true,
  showVisitorCount: true,
  visitorLabel: "Visitors",
  visitorOffset: 0,
  aboutIntro: "The Learning Resource Management Section (LRMS) of the Schools Division Office of Agusan del Norte develops, evaluates, produces and distributes learning resources, and helps schools put them to good use.",
  aboutVision: "We dream of Filipinos who passionately love their country and whose values and competencies enable them to realize their full potential and contribute meaningfully to building the nation.",
  aboutMission: "To protect and promote the right of every Filipino to quality, equitable, culture-based, and complete basic education.",
  aboutValues: "Maka-Diyos\nMaka-tao\nMakakalikasan\nMakabansa",
  aboutMandate: "",
  aboutHistory: "",
  orgChartUrl: "",
  team: [],
  homeShowAnnouncements: true,
  homeShowFeatured: true,
  homeShowRecent: true,
  tileSize: "large",
  navItems: [],
  aiEnabled: false,
  assistantVisible: true,
  aiName: "Hive Helper",
  aiModel: "gemini-3.5-flash-lite",
  aiInstructions: "You are Hive Helper, the friendly guide of LRMS-HIVE for teachers in the Division of Agusan del Norte. Use short, simple sentences. You may answer in English or Filipino, matching the teacher. Recommend only resources from the catalog you are given and never invent links. If nothing matches, say so and suggest emailing the LRMS.",
  storageFolderId: ""
};

window.HIVE_SEED_VERSION = 8; // bump when starter content changes (demo mode reloads it)
/* The live site starts EMPTY: the admin adds tiles, resources, news, events, schools and districts
   from the Admin panel (or Sheet). No sample content is shipped. */
window.HIVE_SEED = { sections: [], resources: [], announcements: [], news: [], events: [], districts: [], schools: [] };
