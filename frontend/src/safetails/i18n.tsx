// @ts-nocheck
/* ============================================================
   SafeTails - lightweight i18n (English / Nepali)
   ------------------------------------------------------------
   Key-based lookup (the same pattern as i18next) with no external
   dependency: a Context exposes { lang, setLang, t }. `t("key")`
   returns the string for the active language, falling back to
   English and then the key itself, so partial coverage degrades
   gracefully. Language persists in localStorage (and is mirrored to
   the user's saved preferences when they change it in Settings).
   Extend coverage by adding keys to STRINGS below.
   ============================================================ */
import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const LANGS = [
  { code: "en", label: "English", native: "English" },
  { code: "ne", label: "Nepali", native: "नेपाली" },
];

const LANG_KEY = "safetails_lang";

// Translation table. English is the source of truth; Nepali is provided for the high-visibility
// chrome (navigation, common actions, settings, auth). Missing keys fall back to English.
const STRINGS: Record<string, Record<string, string>> = {
  // ---- Navigation ----
  "nav.map": { en: "Map", ne: "नक्सा" },
  "nav.rescue": { en: "Rescue & dispatch", ne: "उद्धार तथा परिचालन" },
  "nav.help": { en: "Help centre", ne: "सहायता केन्द्र" },
  "nav.feed": { en: "Community feed", ne: "समुदाय फिड" },
  "nav.leaderboard": { en: "Leaderboard", ne: "लिडरबोर्ड" },
  "nav.insights": { en: "Area insights", ne: "क्षेत्र विश्लेषण" },
  "nav.predictions": { en: "Risk & predictions", ne: "जोखिम तथा पूर्वानुमान" },
  "nav.hotspots": { en: "Hotspot analysis", ne: "हटस्पट विश्लेषण" },
  "nav.adoption": { en: "Adopt", ne: "धर्मपुत्र लिनुहोस्" },
  "nav.myreports": { en: "My reports", ne: "मेरा रिपोर्टहरू" },
  "nav.profile": { en: "Profile", ne: "प्रोफाइल" },
  "nav.settings": { en: "Settings", ne: "सेटिङहरू" },
  "nav.logout": { en: "Log out", ne: "लगआउट" },
  "nav.you": { en: "You", ne: "तपाईं" },
  "action.report": { en: "Report a sighting", ne: "देखिएको रिपोर्ट गर्नुहोस्" },
  "action.reportShort": { en: "Report", ne: "रिपोर्ट" },
  "search.placeholder": { en: "Search reports, wards, people…", ne: "रिपोर्ट, वडा, मानिस खोज्नुहोस्…" },

  // ---- Common actions ----
  "common.save": { en: "Save", ne: "सुरक्षित गर्नुहोस्" },
  "common.cancel": { en: "Cancel", ne: "रद्द गर्नुहोस्" },
  "common.delete": { en: "Delete", ne: "मेट्नुहोस्" },
  "common.confirm": { en: "Confirm", ne: "पुष्टि गर्नुहोस्" },
  "common.loading": { en: "Loading…", ne: "लोड हुँदैछ…" },
  "common.back": { en: "Back", ne: "पछाडि" },
  "common.viewProfile": { en: "View profile", ne: "प्रोफाइल हेर्नुहोस्" },

  // ---- Settings ----
  "settings.profile": { en: "Profile", ne: "प्रोफाइल" },
  "settings.displayName": { en: "Display name", ne: "प्रदर्शन नाम" },
  "settings.username": { en: "Username", ne: "प्रयोगकर्ता नाम" },
  "settings.homeArea": { en: "Home area", ne: "गृह क्षेत्र" },
  "settings.language": { en: "Language", ne: "भाषा" },
  "settings.languageDesc": { en: "Choose the language for the app interface.", ne: "एपको भाषा छान्नुहोस्।" },
  "settings.privacy": { en: "Privacy & visibility", ne: "गोपनीयता तथा दृश्यता" },
  "settings.notifications": { en: "Notifications", ne: "सूचनाहरू" },
  "settings.aiTransparency": { en: "AI & transparency", ne: "एआई तथा पारदर्शिता" },
  "settings.trustworthy": { en: "Keeping reports trustworthy", ne: "रिपोर्टलाई भरपर्दो राख्ने" },
  "settings.dataSafety": { en: "Data & safety", ne: "डेटा तथा सुरक्षा" },

  // ---- Auth ----
  "auth.login": { en: "Log in", ne: "लगइन" },
  "auth.register": { en: "Get started", ne: "सुरु गर्नुहोस्" },
  "auth.email": { en: "Email", ne: "इमेल" },
  "auth.password": { en: "Password", ne: "पासवर्ड" },

  // ---- Page titles + subtitles (shown in the top bar of every page) ----
  "title.map": { en: "Live map", ne: "प्रत्यक्ष नक्सा" },
  "sub.map": { en: "Stray, lost & injured animal sightings across the Kathmandu Valley", ne: "काठमाडौं उपत्यकाभरि छाडा, हराएका र घाइते जनावरका सूचनाहरू" },
  "title.feed": { en: "Community feed", ne: "समुदाय फिड" },
  "sub.feed": { en: "What the community is reporting right now", ne: "समुदायले अहिले रिपोर्ट गरिरहेको" },
  "title.leaderboard": { en: "Leaderboard", ne: "लिडरबोर्ड" },
  "sub.leaderboard": { en: "Top reporters by verified contribution", ne: "प्रमाणित योगदानका आधारमा शीर्ष रिपोर्टरहरू" },
  "title.insights": { en: "Area insights", ne: "क्षेत्र विश्लेषण" },
  "sub.insights": { en: "Aggregated geo-spatial analytics across the Kathmandu Valley", ne: "काठमाडौं उपत्यकाको समग्र भू-स्थानिक विश्लेषण" },
  "title.predictions": { en: "Risk & predictions", ne: "जोखिम तथा पूर्वानुमान" },
  "sub.predictions": { en: "ML-driven area risk scoring and incident forecasting from live data", ne: "प्रत्यक्ष डेटाबाट क्षेत्र जोखिम र घटना पूर्वानुमान" },
  "title.hotspots": { en: "Hotspot analysis", ne: "हटस्पट विश्लेषण" },
  "sub.hotspots": { en: "Where incidents cluster, statistically, and where trouble is building", ne: "घटनाहरू कहाँ केन्द्रित छन् र कहाँ समस्या बढ्दैछ" },
  "title.myreports": { en: "My reports", ne: "मेरा रिपोर्टहरू" },
  "sub.myreports": { en: "Manage your submissions and community contributions", ne: "आफ्ना रिपोर्ट र योगदान व्यवस्थापन गर्नुहोस्" },
  "title.adoption": { en: "Adopt", ne: "धर्मपुत्र लिनुहोस्" },
  "sub.adoption": { en: "Rescued animals looking for a home", ne: "घर खोज्दै गरेका उद्धार गरिएका जनावरहरू" },
  "title.rescue": { en: "Rescue & dispatch", ne: "उद्धार तथा परिचालन" },
  "sub.rescue": { en: "Coordinate volunteers and shelters for injured & urgent cases", ne: "घाइते र जरुरी केसका लागि स्वयंसेवक र आश्रयस्थल समन्वय" },
  "title.help": { en: "Help centre", ne: "सहायता केन्द्र" },
  "sub.help": { en: "Connect helpers and reporters: requests, offers and coordination", ne: "सहयोगी र रिपोर्टरलाई जोड्नुहोस्: अनुरोध, प्रस्ताव र समन्वय" },
  "title.alerts": { en: "Alerts", ne: "सूचनाहरू" },
  "sub.alerts": { en: "Confirmations, rescues, comments & community updates", ne: "पुष्टि, उद्धार, टिप्पणी र समुदाय अपडेट" },
  "title.settings": { en: "Settings", ne: "सेटिङहरू" },
  "sub.settings": { en: "Account, privacy, notifications & data controls", ne: "खाता, गोपनीयता, सूचना र डेटा नियन्त्रण" },
  "title.profile": { en: "Your profile", ne: "तपाईंको प्रोफाइल" },
  "sub.profile": { en: "Reports, reputation & badges", ne: "रिपोर्ट, प्रतिष्ठा र ब्याजहरू" },
  "title.user": { en: "Reporter profile", ne: "रिपोर्टर प्रोफाइल" },
  "sub.user": { en: "Reports, reputation & badges", ne: "रिपोर्ट, प्रतिष्ठा र ब्याजहरू" },
  "title.submit": { en: "New report", ne: "नयाँ रिपोर्ट" },
  "sub.submit": { en: "Report a sighting", ne: "देखिएको रिपोर्ट गर्नुहोस्" },
  "title.report": { en: "Report detail", ne: "रिपोर्ट विवरण" },
  "sub.report": { en: "Sighting details & AI assessment", ne: "सूचना विवरण र एआई मूल्यांकन" },

  // ---- Feed ----
  "feed.recent": { en: "Recent", ne: "पछिल्ला" },
  "feed.popular": { en: "Popular", ne: "लोकप्रिय" },
  "feed.nearby": { en: "Near me", ne: "मेरो नजिक" },
  "feed.injured": { en: "Injured", ne: "घाइते" },
  "feed.toVerify": { en: "To verify", ne: "प्रमाणित गर्न" },
  "feed.yourImpact": { en: "Your impact", ne: "तपाईंको प्रभाव" },
  "feed.trending": { en: "Trending areas now", ne: "अहिले चर्चामा रहेका क्षेत्रहरू" },
  "feed.topReporters": { en: "Top reporters", ne: "शीर्ष रिपोर्टरहरू" },

  // ---- Common labels ----
  "label.points": { en: "points", ne: "अंक" },
  "label.reports": { en: "reports", ne: "रिपोर्टहरू" },
  "label.reputation": { en: "reputation", ne: "प्रतिष्ठा" },
  "label.seeAll": { en: "See all", ne: "सबै हेर्नुहोस्" },
  "common.loadMore": { en: "Load more", ne: "थप लोड गर्नुहोस्" },
};

const LangCtx = createContext<any>({ lang: "en", setLang: () => {}, t: (k: string, f?: string) => f ?? k });

export function LangProvider({ children }: any) {
  const [lang, setLangState] = useState("en");

  // Restore the saved language on first mount (persists across sessions).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      if (saved && LANGS.some(l => l.code === saved)) setLangState(saved);
    } catch {}
  }, []);

  const setLang = useCallback((code: string) => {
    setLangState(code);
    try { window.localStorage.setItem(LANG_KEY, code); } catch {}
    // reflect on <html lang> for a11y / correctness
    try { document.documentElement.setAttribute("lang", code); } catch {}
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const entry = STRINGS[key];
      if (entry) return entry[lang] || entry.en || fallback || key;
      return fallback ?? key;
    },
    [lang],
  );

  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useI18n() {
  return useContext(LangCtx);
}
