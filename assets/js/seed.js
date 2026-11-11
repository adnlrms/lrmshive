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
    links: [
      { label: "Send feedback", url: "" },
      { label: "Learning Resource request form", url: "" }
    ],
    note: "Materials on this site are for educational use of DepEd personnel and learners."
  },
  groups: [
    { id: "g-learn", name: "Learning Resources" },
    { id: "g-kids", name: "Learners' Corner" },
    { id: "g-tools", name: "Tools and Links" },
    { id: "g-about", name: "About Us" }
  ],
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
  aboutMandate: "Admin: describe what the LRMS does — e.g. learning resource development, quality assurance, LR inventory (LRITO), library hub services and teacher support.",
  aboutHistory: "",
  orgChartUrl: "",
  team: [
    { name: "", position: "Education Program Supervisor – LRMS", group: "LRMS Team", photo: "", email: "", bio: "" },
    { name: "", position: "Project Development Officer II – LRMS", group: "LRMS Team", photo: "", email: "", bio: "" },
    { name: "", position: "Librarian II", group: "LRMS Team", photo: "", email: "", bio: "" },
    { name: "", position: "Administrative Assistant", group: "LRMS Team", photo: "", email: "", bio: "" }
  ],
  homeShowAnnouncements: true,
  homeShowFeatured: true,
  homeShowRecent: true,
  tileSize: "large",
  aiEnabled: false,
  assistantVisible: true,
  aiName: "Hive Helper",
  aiModel: "gemini-3.5-flash-lite",
  aiInstructions: "You are Hive Helper, the friendly guide of LRMS-HIVE for teachers in the Division of Agusan del Norte. Use short, simple sentences. You may answer in English or Filipino, matching the teacher. Recommend only resources from the catalog you are given and never invent links. If nothing matches, say so and suggest emailing the LRMS.",
  storageFolderId: ""
};

window.HIVE_SEED_VERSION = 7; // bump when starter content changes (demo mode reloads it)
window.HIVE_SEED = (function () {
  var now = new Date().toISOString();
  var S = [];
  var R = [];
  function sec(id, parentId, title, subtitle, icon, color, order, layout, extra) {
    S.push(Object.assign({ id: id, parentId: parentId || "", title: title, subtitle: subtitle || "", icon: icon, color: color, order: order, visible: true,
      layout: layout || "auto", kind: "section", group: "", span: "1", url: "", body: "", bgImage: "", customColor: "", sort: "manual", updatedAt: now }, extra || {}));
  }
  function res(sectionId, title, o) {
    o = o || {};
    R.push({
      id: "r" + (R.length + 1), sectionId: sectionId, title: title,
      description: o.d || "", type: o.t || "link", url: o.u || "", thumbnail: o.th || "",
      tags: o.tags || "", grade: o.g || "", subject: o.s || "", quarter: o.q || "",
      author: o.a || "", body: o.body || "", featured: !!o.f, visible: true, order: R.length + 1,
      views: o.v || 0, sample: !o.u && o.t !== "note", display: o.disp || "auto", aspect: o.asp || "16:9", createdAt: now, updatedAt: now
    });
  }

  // Top-level tiles (mirrors the menu of the original ADN LRMC Google Site)
  sec("giya", "", "GIYA Drive", "Shared drive of division learning materials", "drive", "river", 1, "", { group: "g-learn" });
  sec("resources", "", "Resources", "Curriculum guides, MATATAG, PPT lessons, guidelines", "folder", "honey", 2, "", { group: "g-learn" });
  sec("elibrary", "", "E-Library", "Read books and storybooks online", "library", "leaf", 3, "shelf", { group: "g-learn" });
  sec("als", "", "ALS Resources", "Alternative Learning System materials", "school", "river", 4, "", { group: "g-learn" });
  sec("elaro", "", "e-LaRo", "Learning games for learners", "game", "plum", 5, "apps", { group: "g-kids" });
  sec("fun", "", "LRMC F.U.N.", "Featuring Unique Narratives", "story", "brick", 6, "", { group: "g-kids" });
  sec("lrapps", "", "LRAPPS", "Systems and tools developed by the LRMS", "apps", "teal", 7, "apps", { group: "g-tools" });
  sec("links", "", "Educational Links", "Trusted learning sites outside DepEd", "globe", "slate", 8, "", { group: "g-tools" });
  sec("awardees", "", "LRMS Awardees", "GTA Hall of Fame", "award", "honey", 9, "", { group: "g-about" });
  sec("about", "", "About LRMS", "Mission, vision, core values and our team", "info", "slate", 10, "", { group: "g-about", kind: "link", url: "#/about" });
  sec("w-visitors", "", "Visitors", "", "people", "honey", 11, "", { group: "g-about", kind: "widget", url: "visitors" });

  // Resources sub-tiles
  sec("shs", "resources", "Strengthened SHS Curriculum", "", "school", "leaf", 1);
  sec("qa", "resources", "Quality Assurance Tools", "", "check", "river", 2);
  sec("matatag", "resources", "MATATAG Resources", "", "spark", "honey", 3);
  sec("ppt", "resources", "PPT Lessons", "", "slides", "brick", 4);
  sec("catchup", "resources", "Catch-Up Fridays", "", "calendar", "plum", 5);
  sec("k12", "resources", "K to 12 Resources", "", "book", "teal", 6);
  sec("memo", "resources", "LRMC Memoranda", "", "memo", "slate", 7);
  sec("gta", "resources", "GTA Guidelines", "", "award", "honey", 8);
  sec("adm", "resources", "ADM Guidelines", "", "file", "river", 9);
  sec("templates", "resources", "Templates", "", "template", "leaf", 10);

  sec("olib", "elibrary", "O-Library", "", "bookopen", "leaf", 1, "shelf");
  sec("multimedia", "elibrary", "Multimedia Library", "", "video", "plum", 2);
  sec("mvre", "elibrary", "Project MVRE", "", "rocket", "brick", 3);

  // Sample entries — replace links in Admin > Resources
  res("giya", "GIYA Drive (main folder)", { t: "folder", d: "The division's shared Google Drive of learning materials. Admin: paste the folder link here.", f: true, tags: "drive giya shared folder" });
  res("matatag", "MATATAG Curriculum Guide — Grade 7 Science", { t: "pdf", g: "Grade 7", s: "Science", tags: "matatag curriculum guide cg", f: true });
  res("matatag", "MATATAG Lesson Exemplar — Grade 4 Mathematics, Quarter 2", { t: "doc", g: "Grade 4", s: "Mathematics", q: "Q2", tags: "lesson exemplar le" });
  res("ppt", "Photosynthesis — PPT Lesson", { t: "slides", g: "Grade 8", s: "Science", q: "Q3", tags: "ppt powerpoint lesson plants" });
  res("ppt", "Fractions on a Number Line — PPT Lesson", { t: "slides", g: "Grade 3", s: "Mathematics", q: "Q3", tags: "ppt fractions" });
  res("catchup", "Catch-Up Fridays Reading Materials, Week 1–4", { t: "folder", s: "Reading", tags: "catch-up friday reading intervention", f: true });
  res("catchup", "Peace and Values Education — Catch-Up Friday Guide", { t: "pdf", s: "Values Education", tags: "catch-up friday values" });
  res("gta", "Guidelines on GTA Recognition", { t: "pdf", tags: "gta guidelines awards" });
  res("adm", "ADM Implementation Guidelines", { t: "pdf", tags: "adm alternative delivery mode" });
  res("templates", "Daily Lesson Log (DLL) Template", { t: "doc", tags: "dll template lesson log" });
  res("templates", "LR Evaluation Form Template", { t: "sheet", tags: "evaluation form quality assurance" });
  res("qa", "LR Quality Assurance Checklist", { t: "pdf", tags: "qa checklist lrqa" });
  res("memo", "Guide to Learning Systems Update, SY 2026–2027", { t: "pdf", tags: "memo memorandum learning systems", f: true });
  res("shs", "Strengthened SHS Curriculum — Core Subjects", { t: "folder", g: "Grade 11", tags: "shs senior high strengthened" });
  res("k12", "K to 12 Most Essential Learning Competencies", { t: "pdf", tags: "melc k12 competencies" });
  res("olib", "Bubuyog and the Big Book (sample flipbook)", { t: "book", u: "assets/sample/storybook-sample.pdf", th: "assets/sample/storybook-sample-cover.jpg", g: "Grade 1", s: "Reading", disp: "flipbook", f: true, d: "A short sample storybook that opens as a flipbook. Replace with your own storybook PDFs.", tags: "storybook flipbook bee reading" });
  res("olib", "Ang Alamat ng Pinya", { t: "book", g: "Grade 2", s: "Filipino", tags: "storybook alamat" });
  res("olib", "Tubay River Stories", { t: "book", g: "Grade 5", s: "English", tags: "local story contextualized" });
  res("multimedia", "Video Lesson: The Water Cycle", { t: "video", g: "Grade 4", s: "Science", tags: "video water cycle" });
  res("mvre", "Project MVRE Reading Kit", { t: "folder", tags: "mvre reading" });
  res("elaro", "Math Quest", { t: "app", s: "Mathematics", tags: "game math quest", f: true });
  res("elaro", "AGNOR LRMS: Space Cadet Mission", { t: "app", tags: "game space cadet" });
  res("elaro", "LRMSpellMaster", { t: "app", s: "English", tags: "spelling game" });
  res("elaro", "SCI QUEST", { t: "app", s: "Science", tags: "science game quest" });
  res("fun", "LRMC F.U.N. — Featured Narratives", { t: "folder", tags: "narratives stories teachers" });
  res("lrapps", "LRITO 5.0", { t: "app", tags: "lrito inventory tool" });
  res("lrapps", "Excel Data Interpreter", { t: "app", tags: "excel data interpreter grades" });
  res("lrapps", "Class Schedule Plotter", { t: "app", tags: "class schedule plotter canva" });
  res("als", "ALS Learning Strand Modules", { t: "folder", s: "ALS", tags: "als alternative learning system modules" });
  res("als", "ICT4ALS", { t: "link", s: "ALS", tags: "ict4als ict" });
  res("awardees", "GTA Hall of Fame", { t: "image", tags: "hall of fame gta awardees" });
  res("links", "PhET Interactive Simulations", { t: "link", u: "https://phet.colorado.edu/", s: "Science", d: "Free science and math simulations from the University of Colorado Boulder.", tags: "simulation physics chemistry math" });
  res("links", "Try it here: Balloons and Static Electricity (PhET)", { t: "embed", u: "https://phet.colorado.edu/sims/html/balloons-and-static-electricity/latest/balloons-and-static-electricity_all.html", s: "Science", g: "Grade 8", disp: "inline", asp: "16:10", d: "An interactive simulation embedded right on this page — drag the balloon and see what happens.", tags: "simulation static electricity interactive" });
  res("links", "K5 Learning", { t: "link", u: "https://www.k5learning.com/", d: "Free worksheets for kindergarten to Grade 5.", tags: "worksheets elementary reading math" });
  res("links", "Servier Medical Art", { t: "link", u: "https://smart.servier.com/", s: "Science", d: "Free medical and biology drawings for slides and handouts.", tags: "biology images anatomy" });

  var A = [{
    id: "a1", title: "Guide to Learning Systems Update, School Year 2026–2027",
    body: "Read the new guide and the linked documents before the start of classes.",
    linkText: "Open the guide", url: "", pinned: true, startDate: "", endDate: "", visible: true
  }];

  var today = new Date(), d = function (n) { var x = new Date(today.getTime() - n * 86400000); return x.toISOString().slice(0, 10); };
  var N = [
    { id: "n1", title: "Sample: Learning Resource Development Workshop", date: d(2), tag: "Activity",
      body: "This is a sample news item. Replace it in Admin › News with a real update from the LRMS.\n\nA news item can have a short story, several photos (they open in a gallery), a link to the Facebook post, and a button to a related document.",
      images: [], fbUrl: "", linkUrl: "", linkText: "", pinned: true, visible: true, createdAt: now, updatedAt: now },
    { id: "n2", title: "Sample: New storybooks added to the E-Library", date: d(9), tag: "Announcement",
      body: "Sample item. New storybooks open as flipbooks — pages turn like a real book.",
      images: [], fbUrl: "", linkUrl: "#/s/olib", linkText: "Open the O-Library", pinned: false, visible: true, createdAt: now, updatedAt: now }
  ];
  // sample events (relative to today so the demo always has upcoming items)
  function ahead(n) { var x = new Date(today.getTime() + n * 86400000); return x.toISOString().slice(0, 10); }
  var fri = new Date(today.getTime()); while (fri.getDay() !== 5) fri = new Date(fri.getTime() - 86400000);
  var E = [
    { id: "e1", title: "Catch-Up Fridays", category: "Catch-Up Friday", startDate: fri.toISOString().slice(0, 10), endDate: "", allDay: true, startTime: "", endTime: "",
      location: "All schools", description: "Weekly Catch-Up Friday sessions on reading and values, peace and health education. Sample event — edit in Admin › Events.", memoUrl: "", memoTitle: "", linkUrl: "#/s/catchup", linkText: "Open Catch-Up Friday materials",
      repeat: "weekly", repeatUntil: ahead(200), visible: true },
    { id: "e2", title: "Sample: Deadline — submission of LR evaluation forms", category: "Deadline", startDate: ahead(2), endDate: "", allDay: true, startTime: "", endTime: "",
      location: "LRMS Office / online", description: "Sample deadline. Attach the division memo so teachers can read it here.", memoUrl: "", memoTitle: "Division Memorandum", linkUrl: "", linkText: "", repeat: "", repeatUntil: "", visible: true },
    { id: "e3", title: "Sample: Storybook Writeshop", category: "Writeshop", startDate: ahead(9), endDate: ahead(11), allDay: false, startTime: "08:00", endTime: "17:00",
      location: "SDO Agusan del Norte Conference Hall", description: "Three-day writeshop for contextualized storybooks. Sample event.", memoUrl: "", memoTitle: "", linkUrl: "", linkText: "", repeat: "", repeatUntil: "", visible: true },
    { id: "e4", title: "Sample: Orientation on LRMS-HIVE for school LR coordinators", category: "Training", startDate: ahead(16), endDate: "", allDay: false, startTime: "13:30", endTime: "16:00",
      location: "Online (Google Meet)", description: "How to find, use and rate resources on LRMS-HIVE. Sample event.", memoUrl: "", memoTitle: "", linkUrl: "", linkText: "Join link", repeat: "", repeatUntil: "", visible: true }
  ];
  // districts (approximate town centres — edit in Admin › Library map) and SAMPLE schools for the demo
  var D = [["buenavista1", "Buenavista I", 8.977, 125.409], ["buenavista2", "Buenavista II", 8.955, 125.445], ["carmen", "Carmen", 8.995, 125.300], ["jabonga", "Jabonga", 9.343, 125.516],
    ["kitcharao", "Kitcharao", 9.457, 125.574], ["lasnieves", "Las Nieves", 8.736, 125.601], ["magallanes", "Magallanes", 9.022, 125.518], ["nasipit", "Nasipit", 8.990, 125.340],
    ["rtr", "Remedios T. Romualdez", 9.056, 125.580], ["santiago", "Santiago", 9.265, 125.560], ["tubay", "Tubay", 9.165, 125.523]]
    .map(function (d) { return { id: d[0], name: d[1], lat: d[2], lng: d[3], library: "none", radiusKm: "", notes: "Approximate location", visible: true }; });
  var off = [[0, 0], [0.025, 0.02], [-0.02, 0.03], [0.03, -0.025], [-0.035, -0.02]];
  var SC = [], n = 0;
  D.forEach(function (d, i) {
    var k = i % 3 === 0 ? 3 : 2;
    for (var j = 0; j < k; j++) {
      n++;
      SC.push({ id: "sc" + n, name: "SAMPLE SCHOOL " + n + " — " + d.name.toUpperCase(), schoolId: String(130000 + n * 7), level: j === 1 ? "Secondary" : "Elementary",
        district: d.name, lat: +(d.lat + off[j][0] + (i % 2 ? 0.006 : -0.004)).toFixed(5), lng: +(d.lng + off[j][1]).toFixed(5),
        library: (n === 1 || n === 14) ? "hub" : (n % 4 === 0 ? "school" : "none"), radiusKm: "", learners: 180 + (n * 53) % 900,
        lrStatus: n % 5 === 0 ? "severe" : n % 3 === 0 ? "lacking" : "sufficient", notes: "Sample — replace with a real school", visible: true });
    }
  });
  return { sections: S, resources: R, announcements: A, news: N, events: E, districts: D, schools: SC };
})();
