// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Data layer (real Kathmandu areas + large dataset)
   Everything is generated deterministically so the app looks
   like a busy, real system. Shapes match what the API will return.
   ============================================================ */

/* ---- deterministic PRNG so the dataset is stable across reloads ---- */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260627);
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
const range = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

/* ---- Current signed-in user ---- */
export const ME = {
  name: "Shreeya Paudel",
  handle: "@shreeya",
  color: "#157d8f",
  level: 4,
  levelName: "Verified Reporter",
  points: 1840,
  reputation: 86,
  reports: 34,
  confirmed: 31,
  ward: "Patan",
  joined: "Mar 2025",
};

/* ---- Real Kathmandu Valley areas (neighbourhood-level) ---- */
type Area = { id: string; name: string; np: string; district: string; lng: number; lat: number; reports: number; injured: number };
const RAW_AREAS: Omit<Area, "reports" | "injured">[] = [
  { id:"thamel",        name:"Thamel",        np:"थमेल",          district:"Kathmandu", lng:85.3110, lat:27.7154 },
  { id:"jamal",         name:"Jamal",         np:"जमल",           district:"Kathmandu", lng:85.3175, lat:27.7095 },
  { id:"naxal",         name:"Naxal",         np:"नक्साल",         district:"Kathmandu", lng:85.3300, lat:27.7110 },
  { id:"dillibazar",    name:"Dillibazar",    np:"दिल्लीबजार",     district:"Kathmandu", lng:85.3260, lat:27.7060 },
  { id:"putalisadak",   name:"Putalisadak",   np:"पुतलीसडक",      district:"Kathmandu", lng:85.3210, lat:27.7040 },
  { id:"lazimpat",      name:"Lazimpat",      np:"लाजिम्पाट",      district:"Kathmandu", lng:85.3220, lat:27.7230 },
  { id:"maharajgunj",   name:"Maharajgunj",   np:"महाराजगन्ज",    district:"Kathmandu", lng:85.3320, lat:27.7370 },
  { id:"samakhushi",    name:"Samakhushi",    np:"समाखुसी",       district:"Kathmandu", lng:85.3140, lat:27.7370 },
  { id:"gongabu",       name:"Gongabu",       np:"गोंगबु",        district:"Kathmandu", lng:85.3110, lat:27.7360 },
  { id:"balaju",        name:"Balaju",        np:"बालाजु",        district:"Kathmandu", lng:85.3000, lat:27.7283 },
  { id:"swayambhu",     name:"Swayambhu",     np:"स्वयम्भू",       district:"Kathmandu", lng:85.2903, lat:27.7149 },
  { id:"kalimati",      name:"Kalimati",      np:"कालिमाटी",      district:"Kathmandu", lng:85.2980, lat:27.6970 },
  { id:"kalanki",       name:"Kalanki",       np:"कलंकी",         district:"Kathmandu", lng:85.2810, lat:27.6935 },
  { id:"teku",          name:"Teku",          np:"टेकु",          district:"Kathmandu", lng:85.3080, lat:27.6960 },
  { id:"tripureshwor",  name:"Tripureshwor",  np:"त्रिपुरेश्वर",    district:"Kathmandu", lng:85.3150, lat:27.6950 },
  { id:"sundhara",      name:"Sundhara",      np:"सुन्धारा",       district:"Kathmandu", lng:85.3130, lat:27.7010 },
  { id:"baneshwor",     name:"New Baneshwor", np:"नयाँ बानेश्वर",  district:"Kathmandu", lng:85.3420, lat:27.6915 },
  { id:"oldbaneshwor",  name:"Old Baneshwor", np:"पुरानो बानेश्वर",district:"Kathmandu", lng:85.3380, lat:27.6960 },
  { id:"tinkune",       name:"Tinkune",       np:"तिनकुने",        district:"Kathmandu", lng:85.3490, lat:27.6890 },
  { id:"sinamangal",    name:"Sinamangal",    np:"सिनामंगल",      district:"Kathmandu", lng:85.3560, lat:27.6960 },
  { id:"koteshwor",     name:"Koteshwor",     np:"कोटेश्वर",       district:"Kathmandu", lng:85.3490, lat:27.6780 },
  { id:"gaushala",      name:"Gaushala",      np:"गौशाला",        district:"Kathmandu", lng:85.3450, lat:27.7090 },
  { id:"chabahil",      name:"Chabahil",      np:"चाबहिल",        district:"Kathmandu", lng:85.3470, lat:27.7177 },
  { id:"boudha",        name:"Boudha",        np:"बौद्ध",          district:"Kathmandu", lng:85.3620, lat:27.7215 },
  { id:"gokarna",       name:"Gokarna",       np:"गोकर्ण",        district:"Kathmandu", lng:85.4200, lat:27.7430 },
  { id:"budhanilkantha",name:"Budhanilkantha",np:"बुढानिलकण्ठ",   district:"Kathmandu", lng:85.3620, lat:27.7790 },
  { id:"tokha",         name:"Tokha",         np:"टोखा",          district:"Kathmandu", lng:85.3290, lat:27.7560 },
  { id:"patan",         name:"Patan",         np:"पाटन",          district:"Lalitpur",  lng:85.3250, lat:27.6727 },
  { id:"jawalakhel",    name:"Jawalakhel",    np:"जावलाखेल",      district:"Lalitpur",  lng:85.3110, lat:27.6710 },
  { id:"pulchowk",      name:"Pulchowk",      np:"पुल्चोक",        district:"Lalitpur",  lng:85.3170, lat:27.6790 },
  { id:"kupondole",     name:"Kupondole",     np:"कुपण्डोल",       district:"Lalitpur",  lng:85.3170, lat:27.6850 },
  { id:"sanepa",        name:"Sanepa",        np:"सानेपा",        district:"Lalitpur",  lng:85.3070, lat:27.6840 },
  { id:"jhamsikhel",    name:"Jhamsikhel",    np:"झम्सिखेल",      district:"Lalitpur",  lng:85.3090, lat:27.6770 },
  { id:"lagankhel",     name:"Lagankhel",     np:"लगनखेल",        district:"Lalitpur",  lng:85.3230, lat:27.6670 },
  { id:"gwarko",        name:"Gwarko",        np:"ग्वार्को",       district:"Lalitpur",  lng:85.3340, lat:27.6660 },
  { id:"satdobato",     name:"Satdobato",     np:"सातदोबाटो",     district:"Lalitpur",  lng:85.3260, lat:27.6580 },
  { id:"imadol",        name:"Imadol",        np:"इमाडोल",        district:"Lalitpur",  lng:85.3450, lat:27.6620 },
  { id:"ekantakuna",    name:"Ekantakuna",    np:"एकान्तकुना",     district:"Lalitpur",  lng:85.3070, lat:27.6640 },
  { id:"nakhu",         name:"Nakhu",         np:"नख्खु",         district:"Lalitpur",  lng:85.3180, lat:27.6500 },
  { id:"bhaisepati",    name:"Bhaisepati",    np:"भैंसेपाटी",      district:"Lalitpur",  lng:85.3030, lat:27.6470 },
  { id:"balkhu",        name:"Balkhu",        np:"बल्खु",         district:"Kathmandu", lng:85.2990, lat:27.6840 },
  { id:"kirtipur",      name:"Kirtipur",      np:"कीर्तिपुर",      district:"Kathmandu", lng:85.2774, lat:27.6790 },
  // ---- Bhaktapur district ----
  { id:"bhaktapur",     name:"Bhaktapur",     np:"भक्तपुर",        district:"Bhaktapur", lng:85.4298, lat:27.6710 },
  { id:"suryabinayak",  name:"Suryabinayak",  np:"सूर्यविनायक",    district:"Bhaktapur", lng:85.4280, lat:27.6620 },
  { id:"kamalbinayak",  name:"Kamalbinayak",  np:"कमलविनायक",     district:"Bhaktapur", lng:85.4360, lat:27.6760 },
  { id:"sallaghari",    name:"Sallaghari",    np:"सल्लाघारी",      district:"Bhaktapur", lng:85.4180, lat:27.6730 },
  { id:"thimi",         name:"Madhyapur Thimi",np:"मध्यपुर थिमी",  district:"Bhaktapur", lng:85.3850, lat:27.6810 },
  { id:"gatthaghar",    name:"Gatthaghar",    np:"गठ्ठाघर",        district:"Bhaktapur", lng:85.3760, lat:27.6750 },
  { id:"lokanthali",    name:"Lokanthali",    np:"लोकन्थली",       district:"Bhaktapur", lng:85.3650, lat:27.6770 },
];

/* ---- Species + status dictionaries ---- */
export const SPECIES: any = {
  dog:     { label: "Dog",     np: "कुकुर",   color: "var(--sp-dog)",     hex: "#0e7c8b" }, // teal
  cat:     { label: "Cat",     np: "बिरालो",  color: "var(--sp-cat)",     hex: "#e8951a" }, // orange
  cow:     { label: "Cow",     np: "गाई",     color: "var(--sp-cow)",     hex: "#7c5cd0" }, // purple
  buffalo: { label: "Buffalo", np: "भैंसी",    color: "var(--sp-buffalo)", hex: "#b5651d" }, // brown
  other:   { label: "Other",   np: "अन्य",     color: "var(--sp-other)",   hex: "#5c8a3a" }, // olive green
};
export const STATUS: any = {
  active:   { label: "Active",       cls: "status-active",   hex: "#e0962a" }, // amber - needs attention
  helping:  { label: "Being helped", cls: "status-helping",  hex: "#2f6fd0" }, // blue - in progress
  resolved: { label: "Resolved",     cls: "status-resolved", hex: "#2e9e5b" }, // green - done
};
export const AV = ["#157d8f","#d98a1f","#3f7ec2","#6d5bd0","#c2402a","#3aa3b5","#e6b22f","#3f5249","#2f8f6b","#9a5bd0"];

/* ---- Reporter pool ---- */
type Reporter = { name: string; handle: string; color: string; rep: number; points: number; reports: number; ward: string; level: number; levelName: string; badges: number; trend: string; me?: boolean };
const FIRST = ["Nisha","Hari","Laxmi","Anita","Prabin","Maya","Bibek","Gopal","Tashi","Sita","Ramesh","Sunita","Deepak","Kiran","Pooja","Sabin","Dipesh","Nabin","Rita","Suman","Anu","Bishal","Sneha","Rojan","Manish","Aarati","Kabita","Niraj","Sarita","Yogesh"];
const LAST = ["Rai","Bhandari","Pradhan","Gurung","Magar","Shrestha","Shah","Nepali","Dorje","Karki","Thapa","K.C.","Lama","Tamang","Maharjan","Adhikari","Basnet","Bhatta","Sapkota","Poudel"];
function levelFor(points: number) {
  if (points >= 5000) return [6, "Guardian"];
  if (points >= 3500) return [5, "Trusted Reporter"];
  if (points >= 1700) return [4, "Verified Reporter"];
  if (points >= 1000) return [3, "Active Reporter"];
  if (points >= 400)  return [2, "Reporter"];
  return [1, "Newcomer"];
}
const REPORTERS: Reporter[] = (() => {
  const list: Reporter[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 26; i++) {
    let name = `${pick(FIRST)} ${pick(LAST)}`;
    let guard = 0;
    while (seen.has(name) && guard++ < 20) name = `${pick(FIRST)} ${pick(LAST)}`;
    seen.add(name);
    const points = range(220, 5400);
    const [level, levelName] = levelFor(points) as [number, string];
    const reports = Math.round(points / range(38, 52));
    const tr = range(-3, 5);
    list.push({
      name, handle: "@" + name.split(" ")[0].toLowerCase() + i,
      color: AV[i % AV.length], rep: range(52, 97), points, reports,
      ward: pick(RAW_AREAS).name, level, levelName, badges: range(2, 12),
      trend: tr > 0 ? `+${tr}` : tr < 0 ? `${tr}` : "0",
    });
  }
  // inject current user
  list.push({ name: ME.name, handle: ME.handle, color: ME.color, rep: ME.reputation, points: ME.points, reports: ME.reports, ward: ME.ward, level: ME.level, levelName: ME.levelName, badges: 6, trend: "+4", me: true });
  return list.sort((a, b) => b.points - a.points);
})();

export const LEADERS = REPORTERS.map((r, i) => ({ rank: i + 1, ...r }));

/* ---- normalise any reporter into a profile-shaped person ---- */
export function normalizePerson(name: string) {
  if (name === ME.name) return { ...ME, badges: 6, trend: "+4", me: true, rank: LEADERS.find(l => l.me)?.rank };
  const l: any = LEADERS.find(x => x.name === name);
  if (l) return {
    name: l.name, handle: l.handle, color: l.color, reputation: l.rep, points: l.points,
    reports: l.reports, ward: l.ward, level: l.level, levelName: l.levelName,
    badges: l.badges, trend: l.trend, joined: "2025", me: false, rank: l.rank,
  };
  // unknown reporter (e.g. a commenter) - sensible defaults
  const first = name.split(" ")[0].toLowerCase();
  return { name, handle: "@" + first, color: AV[name.length % AV.length], reputation: 68, points: 720, reports: 14, ward: "Kathmandu", level: 2, levelName: "Reporter", badges: 3, trend: "0", joined: "2025", me: false, rank: undefined };
}

/* ---- Report generation ---- */
const NOTES: any = {
  dog: [
    "Brown street dog resting near {a}, looks calm and friendly.",
    "Pack of 3-4 dogs around {a}, all seem healthy.",
    "Limping dog near {a} chowk, favouring a back leg.",
    "Friendly black dog at {a}, hungry but otherwise fine.",
    "Small puppy wandering near {a}, looking for its mother.",
    "Dog with a skin condition near {a}, scratching a lot.",
    "Old dog sleeping by a shop in {a}, regular here.",
    "Dog hit by a vehicle near {a}, not moving much - urgent.",
  ],
  cat: [
    "Ginger cat near {a}, friendly and well fed.",
    "Kitten near {a}, one eye looks infected.",
    "Grey cat colony around {a}, looks healthy.",
    "Lost tabby cat spotted near {a} with a collar.",
    "Cat stuck on a rooftop near {a}, meowing.",
  ],
  cow: [
    "Cow sitting in the middle of {a} junction, blocking traffic.",
    "Cow with a limp near {a}, favouring a front leg.",
    "Cow grazing near {a} underpass, owner not around.",
    "Cow returned to owner near {a}.",
  ],
  buffalo: [
    "Buffalo loose near {a} bypass.",
    "Two buffaloes grazing near {a}.",
    "Buffalo with a wound near {a}, limping.",
  ],
  other: [
    "Goat near {a}, not sure of the owner.",
    "Injured pigeon near {a} rooftop.",
    "Monkey troop near {a} temple, one looks hurt.",
    "Stray rabbit spotted near {a}.",
  ],
};
const SPECIES_KEYS = ["dog","dog","dog","dog","cat","cat","cat","cow","cow","buffalo","other"]; // weighted
const SEVS = ["mild","moderate","severe"];
const INJ_WHY: any = {
  mild: "Minor limp / skin irritation visible; not an acute wound.",
  moderate: "Favouring a limb with a possible open wound - needs a check-up.",
  severe: "Lateral recumbency and visible bleeding indicate a likely collision; urgent.",
};

function probsFor(sp: string, conf: number) {
  const keys = ["dog","cat","cow","buffalo","other"];
  const rest = 1 - conf; const o: any = {}; let acc = 0;
  keys.forEach((k, i) => { if (k === sp) return; const v = +(rest * [0.42,0.27,0.17,0.14][i % 4]).toFixed(3); o[k] = v; acc += v; });
  o[sp] = +(conf + (rest - acc)).toFixed(3);
  return o;
}
function timeString(mins: number) {
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
  return `${Math.round(mins / 1440)}d ago`;
}
const COMMENT_BANK = [
  "I can drop food there this evening.","So sweet 🐾","Sharing widely.","Volunteer dispatched, thank you.",
  "Please contact a vet for this.","I pass by there daily, will check.","Ambulance on the way.","Thank you all 🙏",
  "Saw the same one yesterday.","Adding to our round today.",
];

let REPORT_ID = 1;
function makeReport(mins: number): any {
  const area = pick(RAW_AREAS);
  const sp = pick(SPECIES_KEYS);
  const injured = rnd() < 0.26;
  const conf = injured ? +(0.74 + rnd() * 0.24).toFixed(2) : +(0.58 + rnd() * 0.4).toFixed(2);
  const status: string = injured
    ? pick(["active","active","helping","resolved"])
    : pick(["active","active","helping","resolved","resolved"]);
  const reporter = pick(REPORTERS);
  const sev = pick(SEVS);
  const id = REPORT_ID++;
  // jitter around the area centroid
  const jlng = area.lng + (rnd() - 0.5) * 0.012;
  const jlat = area.lat + (rnd() - 0.5) * 0.010;
  const note = pick(NOTES[sp]).replace("{a}", area.name);
  const nc = range(0, 3);
  const comments = Array.from({ length: nc }, () => ({ u: pick(REPORTERS).name.split(" ")[0] + " " + pick(LAST)[0] + ".", c: pick(COMMENT_BANK), t: timeString(range(2, 200)) }));
  return {
    id, lng: jlng, lat: jlat,
    species: sp,
    speciesGuess: SPECIES[sp].label,
    injured, status, ward: area.name, district: area.district,
    mins, time: timeString(mins),
    note,
    reporter: reporter.name, reporterRep: reporter.rep, reporterColor: reporter.color,
    conf, unverified: conf < 0.7,
    likes: range(0, 64), comments,
    probs: probsFor(sp, conf),
    aiInjury: injured
      ? { injured: true, confidence: +(0.66 + rnd() * 0.3).toFixed(2), rationale: INJ_WHY[sev], severity: sev }
      : { injured: false, confidence: 0.9, rationale: "No visible wounds, limping, or distress cues detected in the image.", severity: "none" },
    trust: conf < 0.7 ? "held" : "published",
  };
}

// ~165 reports spread across the last 14 days, denser recently
export const REPORTS: any[] = (() => {
  const out: any[] = [];
  for (let i = 0; i < 165; i++) {
    // bias toward recent: square the random
    const r = rnd() * rnd();
    const mins = Math.max(3, Math.round(r * 14 * 1440));
    out.push(makeReport(mins));
  }
  return out.sort((a, b) => a.mins - b.mins);
})();

/* ---- per-area aggregates (computed from the real reports) ---- */
export const WARDS: Area[] = RAW_AREAS.map(a => {
  const here = REPORTS.filter(r => r.ward === a.name);
  return { ...a, reports: here.length, injured: here.filter(r => r.injured).length };
});
export const AREAS = WARDS;

/* ---- Chart series ---- */
// reports per day for the last 14 days
export const DAILY = (() => {
  const days: any[] = [];
  for (let d = 13; d >= 0; d--) {
    const from = d * 1440, to = (d + 1) * 1440;
    const here = REPORTS.filter(r => r.mins >= from && r.mins < to);
    const label = d === 0 ? "Today" : d === 1 ? "Yest" : `-${d}d`;
    days.push({ day: label, reports: here.length, injured: here.filter(r => r.injured).length });
  }
  return days;
})();
export const SPECIES_MIX = Object.keys(SPECIES).map(k => ({
  key: k, name: SPECIES[k].label, value: REPORTS.filter(r => r.species === k).length, color: SPECIES[k].hex,
}));
export const STATUS_MIX = Object.keys(STATUS).map(k => ({
  key: k, name: STATUS[k].label, value: REPORTS.filter(r => r.status === k).length,
}));
export const TOP_AREAS = WARDS.slice().sort((a, b) => b.reports - a.reports).slice(0, 10);

/* ---- Badges ---- */
export const BADGES = [
  { id:"first",   name:"First Paw",        icon:"paw",    color:"#3aa3b5", desc:"Submit your first report",             earned:true,  date:"Mar 2025" },
  { id:"ten",     name:"Ten Reports",      icon:"stack",  color:"#d98a1f", desc:"Submit 10 verified reports",           earned:true,  date:"Apr 2025" },
  { id:"explorer",name:"Area Explorer",    icon:"map",    color:"#3f7ec2", desc:"Report from 5 different areas",         earned:true,  date:"Apr 2025" },
  { id:"verified",name:"Verified Reporter",icon:"shield", color:"#157d8f", desc:"Reach reputation 80+",                  earned:true,  date:"May 2025" },
  { id:"injury",  name:"First Responder",  icon:"cross",  color:"#c2402a", desc:"Report 5 injured animals confirmed",    earned:true,  date:"May 2025" },
  { id:"helper",  name:"Community Helper", icon:"heart",  color:"#6d5bd0", desc:"Help resolve 10 reports",               earned:true,  date:"Jun 2025" },
  { id:"streak",  name:"7-Day Streak",     icon:"flame",  color:"#e6b22f", desc:"Report 7 days in a row",                earned:false },
  { id:"guardian",name:"Area Guardian",    icon:"star",   color:"#3aa3b5", desc:"Top reporter in your area for a month", earned:false },
  { id:"century", name:"Centurion",        icon:"trophy", color:"#d98a1f", desc:"Submit 100 verified reports",           earned:false },
];

/* ---- Adoption listings ---- */
export const ADOPTIONS = [
  { id:1, name:"Kaalu",  sp:"dog", age:"~2 yrs", sex:"Male",   ward:"Patan",      vacc:true,  desc:"Gentle black street dog, great with people. Rescued after the Kalanki incident, fully recovered.", org:"KAT Centre", status:"Ready" },
  { id:2, name:"Mishri", sp:"cat", age:"~8 mo",  sex:"Female", ward:"Thamel",     vacc:true,  desc:"Playful ginger kitten, litter trained. Treated for an eye infection, now healthy.", org:"Sneha's Care", status:"Ready" },
  { id:3, name:"Bhuti",  sp:"dog", age:"~4 yrs", sex:"Female", ward:"Jawalakhel", vacc:true,  desc:"Calm older dog, perfect for a quiet home. Loves sitting in the sun.", org:"KAT Centre", status:"Ready" },
  { id:4, name:"Tiger",  sp:"cat", age:"~1 yr",  sex:"Male",   ward:"Naxal",      vacc:false, desc:"Friendly tabby, currently under observation. Available soon after vaccination.", org:"Sneha's Care", status:"Soon" },
  { id:5, name:"Moti",   sp:"dog", age:"~6 mo",  sex:"Male",   ward:"Boudha",     vacc:true,  desc:"Energetic puppy looking for an active family. Vaccinated and dewormed.", org:"Animal Nepal", status:"Ready" },
  { id:6, name:"Rani",   sp:"dog", age:"~3 yrs", sex:"Female", ward:"Balaju",     vacc:true,  desc:"Loyal and protective, house-trained. Would suit a family with a yard.", org:"Animal Nepal", status:"Ready" },
  { id:7, name:"Simba",  sp:"cat", age:"~2 yrs", sex:"Male",   ward:"Sanepa",     vacc:true,  desc:"Quiet lap cat, loves a warm window. Neutered and vaccinated.", org:"Sneha's Care", status:"Ready" },
  { id:8, name:"Heera",  sp:"dog", age:"~5 yrs", sex:"Female", ward:"Bhaisepati", vacc:true,  desc:"Affectionate senior dog, fully vetted. Great companion for a calm home.", org:"KAT Centre", status:"Ready" },
];

/* ---- Partner shelters ---- */
export const SHELTERS = [
  { id:"kat",   name:"KAT Centre",   area:"Budhanilkantha", beds:40, used:31, vets:3, color:"#3aa3b5", phone:"01-4373169" },
  { id:"sneha", name:"Sneha's Care", area:"Chobhar",        beds:28, used:19, vets:2, color:"#d98a1f", phone:"01-4910000" },
  { id:"anepal",name:"Animal Nepal", area:"Kirtipur",       beds:22, used:12, vets:2, color:"#3f7ec2", phone:"01-5570000" },
];

/* ---- Volunteers ---- */
export const VOLUNTEERS = [
  { id:"kiran",  name:"Kiran Thapa",  ward:"New Baneshwor", color:"#3aa3b5", onDuty:true,  active:2 },
  { id:"sunita", name:"Sunita K.C.",  ward:"Patan",         color:"#d98a1f", onDuty:true,  active:1 },
  { id:"deepak", name:"Deepak Rai",   ward:"Kalanki",       color:"#c2402a", onDuty:true,  active:1 },
  { id:"anu",    name:"Nurse Anu",    ward:"Maharajgunj",   color:"#6d5bd0", onDuty:true,  active:0 },
  { id:"bikash", name:"Bikash Lama",  ward:"Boudha",        color:"#3f7ec2", onDuty:false, active:0 },
  { id:"rita",   name:"Rita Karki",   ward:"Jhamsikhel",    color:"#2f8f6b", onDuty:true,  active:1 },
];

export const RESCUE_STAGES = [
  { id:"new",        label:"New",        hint:"Awaiting triage" },
  { id:"triaged",    label:"Triaged",    hint:"Severity assessed" },
  { id:"dispatched", label:"Dispatched", hint:"Volunteer en route" },
  { id:"onscene",    label:"On scene",   hint:"Being handled" },
  { id:"resolved",   label:"Resolved",   hint:"At shelter / released" },
];

/* ---- Rescue cases: derived from the most urgent injured reports ---- */
export const RESCUES = (() => {
  const injured = REPORTS.filter(r => r.injured).slice(0, 9);
  const stages = ["onscene","dispatched","triaged","new","triaged","dispatched","resolved","resolved","new"];
  return injured.map((r, i) => ({
    id: `R-${230 - i}`,
    reportId: r.id,
    species: r.species,
    ward: r.ward,
    severity: r.aiInjury.severity === "none" ? "moderate" : r.aiInjury.severity,
    stage: stages[i % stages.length],
    vol: i % 4 === 3 ? null : VOLUNTEERS[i % VOLUNTEERS.length].name,
    shelter: i % 5 === 0 ? null : SHELTERS[i % SHELTERS.length].name,
    eta: ["on scene","~8 min","assigning","-","~15 min","reunited"][i % 6],
    time: r.time,
    note: r.note,
    prio: i + 1,
  }));
})();

/* ---- Notifications ---- */
export const NOTIFS = [
  { id:1, kind:"dispatch", icon:"cross",   accent:"var(--coral)",     title:"Urgent rescue near you",          body:"A severe case in Kalanki was just dispatched. A volunteer is on scene.", time:"2m",  unread:true },
  { id:2, kind:"confirm",  icon:"thumb",   accent:"var(--green)",     title:"Your Patan report was confirmed", body:"2 neighbours validated your sighting. +30 points awarded.",               time:"12m", unread:true },
  { id:3, kind:"comment",  icon:"comment", accent:"var(--sp-buffalo)",title:"Kiran commented",                 body:"“I can drop food there this evening.” on your Baneshwor report.",          time:"3h",  unread:true },
  { id:4, kind:"badge",    icon:"award",   accent:"var(--gold-600)",  title:"Badge unlocked: Community Helper",body:"You helped resolve 10 reports. Keep it up!",                             time:"5h",  unread:false },
  { id:5, kind:"rep",      icon:"shield",  accent:"var(--green)",     title:"Reputation rose to 86",           body:"High reputation lets your reports publish without waiting.",              time:"1d",  unread:false },
  { id:6, kind:"adopt",    icon:"heart",   accent:"var(--coral-600)", title:"Kaalu found a home",              body:"A dog you reported in Kalanki was adopted via KAT Centre. 🎉",            time:"2d",  unread:false },
  { id:7, kind:"system",   icon:"sparkle", accent:"var(--green)",     title:"Weekly valley digest ready",      body:"Reporting rose 12% - Baneshwor & Patan led activity this week.",          time:"3d",  unread:false },
];

/* ---- Activity ---- */
export const ACTIVITY = [
  { t:"Your report in Patan was confirmed by 2 neighbours", time:"12m", kind:"confirm", pts:"+30" },
  { t:"You earned the Community Helper badge", time:"2h", kind:"badge" },
  { t:"Kiran commented on your Baneshwor report", time:"3h", kind:"comment" },
  { t:"Your reputation rose to 86", time:"1d", kind:"rep", pts:"+2" },
  { t:"Your Jhamsikhel sighting was marked resolved", time:"2d", kind:"confirm", pts:"+15" },
  { t:"You reached a 5-area reporting streak", time:"4d", kind:"badge" },
];
