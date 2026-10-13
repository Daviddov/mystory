/**
 * Six original sample stories with their illustrations. Written for this
 * project (not adapted from existing books). Run `npm run seed` to write them
 * into ./data.
 */
import type { AgeGroup } from "../../src/lib/types";
import * as a from "./art";

export interface SeedPage {
  text: string;
  textNikud?: string;
  /** Accessible description of the illustration. */
  alt: string;
  /** SVG body (800x600). */
  art: string;
}

export interface SeedStory {
  id: string;
  slug: string;
  title: string;
  summary: string;
  ageGroup: AgeGroup;
  readingMinutes: number;
  categories: string[];
  tags: string[];
  themes: string[];
  discussionQuestions: string[];
  viewCount: number;
  publishedAt: string;
  cover: string;
  pages: SeedPage[];
}

const GARDEN_STARS = a.NIGHT_STARS;

function gardenBase(): string {
  return a.daySky() + a.sun(700, 90, 40) + a.cloud(160, 100, 0.9) + a.hills(420) + a.ground(470);
}

function nightBase(): string {
  return a.nightSky() + a.stars(GARDEN_STARS);
}

// ---------------------------------------------------------------------------
// 1. Who is hiding in the garden? (0-2, with nikud)
// ---------------------------------------------------------------------------

const garden: SeedStory = {
  id: "seed-garden",
  slug: "who-hides-in-the-garden",
  title: "מי מתחבא בגינה?",
  summary: "משחק מחבואים קטן בגינה: מאחורי כל עלה, פרח וענף מחכה חבר חדש. ספר ראשון עם משפטים קצרים שחוזרים על עצמם.",
  ageGroup: "0-2",
  readingMinutes: 2,
  categories: ["animals", "nature", "educational"],
  tags: ["גינה", "חתולים", "ציפורים", "צבעים"],
  themes: ["curiosity"],
  discussionQuestions: ["איזו חיה מצאנו על הפרח?", "איפה עוד אפשר להתחבא בגינה?", "איזה קול עושה הצפרדע?"],
  viewCount: 148,
  publishedAt: "2026-09-02T07:00:00.000Z",
  cover: a.cover(
    "מי מתחבא בגינה?",
    a.daySky(600, 560) + a.sun(500, 90, 40) + a.ground(430, "#8FD08A", 600, 560) +
      a.tree(120, 450, 1.1) + a.flower(330, 470, 1.4) + a.flower(450, 480, 1.1, "#C59CF0") +
      a.kitten(250, 520, 1.1) + a.ladybug(420, 380, 0.6) + a.grass(0, 560, 600),
    "#2E8B57",
  ),
  pages: [
    {
      text: "בוקר טוב, גינה! מי מתחבא פה?",
      textNikud: "בֹּקֶר טוֹב, גִּנָּה! מִי מִתְחַבֵּא פֹּה?",
      alt: "גינה ירוקה בבוקר עם עץ, פרחים ושמש",
      art: gardenBase() + a.tree(150, 480, 1.2) + a.flower(420, 500, 1.3) + a.flower(540, 510, 1.1, "#C59CF0") +
        a.flower(650, 500, 1.2, "#FFB347") + a.grass(0, 600, 800),
    },
    {
      text: "מי מתחבא מתחת לעלה? שבלול קטן! שלום, שבלול.",
      textNikud: "מִי מִתְחַבֵּא מִתַּחַת לֶעָלֶה? שַׁבְּלוּל קָטָן! שָׁלוֹם, שַׁבְּלוּל.",
      alt: "שבלול קטן מציץ מתחת לעלה גדול",
      art: gardenBase() + a.snail(400, 520, 1.5) + a.bigLeaf(380, 300, 2) + a.grass(0, 600, 800),
    },
    {
      text: "מי מתחבא על הפרח? חיפושית אדומה! שלום, חיפושית.",
      textNikud: "מִי מִתְחַבֵּא עַל הַפֶּרַח? חִפּוּשִׁית אֲדֻמָּה! שָׁלוֹם, חִפּוּשִׁית.",
      alt: "חיפושית אדומה עם נקודות שחורות יושבת על פרח ורוד",
      art: gardenBase() + a.flower(400, 560, 3.6) + a.ladybug(400, 270, 1.3) + a.grass(0, 600, 800),
    },
    {
      text: "מי מתחבא ליד השלולית? צפרדע ירוקה! קווה, קווה.",
      textNikud: "מִי מִתְחַבֵּא לְיַד הַשְּׁלוּלִית? צְפַרְדֵּעַ יְרֻקָּה! קְוָה, קְוָה.",
      alt: "צפרדע ירוקה יושבת ליד שלולית כחולה",
      art: gardenBase() + a.puddle(330, 530, 2) + a.frog(520, 500, 1.7) + a.grass(600, 600, 200) + a.grass(0, 600, 120),
    },
    {
      text: "מי מתחבא על הענף? ציפור כחולה! ציף, ציף.",
      textNikud: "מִי מִתְחַבֵּא עַל הֶעָנָף? צִפּוֹר כְּחֻלָּה! צִיף, צִיף.",
      alt: "ציפור כחולה עומדת על ענף של עץ",
      art: a.daySky() + a.cloud(620, 120, 1) + a.tree(120, 640, 2.4) +
        `<path d="M150 330 Q 400 300 640 340" stroke="#9B6B43" stroke-width="22" fill="none"/>` +
        a.bigLeaf(600, 330, 0.5) + a.bird(430, 296, 1.6),
    },
    {
      text: "מי מתחבא בתוך העשב? חתלתול רך! מיאו.",
      textNikud: "מִי מִתְחַבֵּא בְּתוֹךְ הָעֵשֶׂב? חֲתַלְתּוּל רַךְ! מְיָאוּ.",
      alt: "חתלתול כתום מציץ מתוך עשב גבוה",
      art: gardenBase() + a.kitten(400, 540, 2.2) + a.grass(0, 600, 800) + a.grass(7, 600, 800, "#4E9F5B"),
    },
    {
      text: "ומי מתחבא מאחורי העץ? זה אני! קוקו!",
      textNikud: "וּמִי מִתְחַבֵּא מֵאֲחוֹרֵי הָעֵץ? זֶה אֲנִי! קוּקוּ!",
      alt: "ילד מחייך מציץ מאחורי עץ ומנופף בידיים",
      art: gardenBase() + a.person(500, 560, 1.5, { shirt: "#FFB347", cheer: true, mood: "laugh" }) +
        a.tree(290, 580, 2) + a.grass(0, 600, 800) + a.speech(560, 90, "קוקו!", 180),
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. The little star goes to sleep (0-2, with nikud)
// ---------------------------------------------------------------------------

const star: SeedStory = {
  id: "seed-star",
  slug: "little-star-goes-to-sleep",
  title: "הכוכב הקטן הולך לישון",
  summary: "הכוכב הקטן מפהק ואומר לילה טוב לכל מי שהוא רואה מלמעלה: לענן, לירח, לינשוף, לים ולבית הקטן. ספר הרגעה קצר לסוף היום.",
  ageGroup: "0-2",
  readingMinutes: 2,
  categories: ["bedtime", "nature"],
  tags: ["שינה", "לילה", "ירח", "כוכבים"],
  themes: ["feelings"],
  discussionQuestions: ["למי הכוכב אמר לילה טוב?", "למי אנחנו רוצים לומר לילה טוב היום?"],
  viewCount: 231,
  publishedAt: "2026-09-09T07:00:00.000Z",
  cover: a.cover(
    "הכוכב הקטן הולך לישון",
    a.nightSky(600, 560) + a.stars([[60, 80], [150, 200, 2], [520, 70, 4], [470, 250, 2], [90, 380, 3], [540, 420, 2], [330, 60, 2]]) +
      a.moonChar(470, 150, 0.7, "sleep") + a.cloud(150, 440, 1.2, "#C9CCF0", 0.7) + a.starChar(290, 320, 1.7, "sleep"),
    "#3A3F7A",
    "#FFF3B0",
  ),
  pages: [
    {
      text: "הכוכב הקטן מפהק. הגיע הזמן לישון.",
      textNikud: "הַכּוֹכָב הַקָּטָן מְפַהֵק. הִגִּיעַ הַזְּמַן לִישֹׁן.",
      alt: "כוכב צהוב קטן מפהק בשמי הלילה",
      art: nightBase() + a.starChar(400, 290, 2.1, "wow"),
    },
    {
      text: "לילה טוב, ענן רך.",
      textNikud: "לַיְלָה טוֹב, עָנָן רַךְ.",
      alt: "הכוכב הקטן מרחף ליד ענן רך",
      art: nightBase() + a.cloud(330, 400, 3, "#C9CCF0", 0.9) + a.starChar(560, 200, 1.3, "smile"),
    },
    {
      text: "לילה טוב, ירח עגול.",
      textNikud: "לַיְלָה טוֹב, יָרֵחַ עָגֹל.",
      alt: "ירח עגול ומחייך ולידו הכוכב הקטן",
      art: nightBase() + a.moonChar(300, 280, 2.1, "smile") + a.starChar(620, 170, 1, "smile"),
    },
    {
      text: "לילה טוב, ינשוף ער.",
      textNikud: "לַיְלָה טוֹב, יַנְשׁוּף עֵר.",
      alt: "ינשוף עם עיניים גדולות יושב על ענף בלילה",
      art: nightBase() + a.tree(160, 700, 2.6, "#2F5D50", "#5B4636") +
        `<path d="M200 430 Q 420 400 620 440" stroke="#5B4636" stroke-width="22" fill="none"/>` +
        a.owl(430, 410, 1.9) + a.starChar(680, 130, 0.8, "smile"),
    },
    {
      text: "לילה טוב, ים שקט.",
      textNikud: "לַיְלָה טוֹב, יָם שָׁקֵט.",
      alt: "ים שקט בלילה והכוכב משתקף מעליו",
      art: nightBase() + a.moonChar(140, 130, 0.7, "sleep") + a.starChar(560, 190, 1.2, "smile") + a.sea(390) +
        `<path d="M520 440 h 80 M500 480 h 120 M530 520 h 60" stroke="#FFD45E" stroke-width="6" opacity="0.6"/>`,
    },
    {
      text: "לילה טוב, בית קטן עם חלון מואר.",
      textNikud: "לַיְלָה טוֹב, בַּיִת קָטָן עִם חַלּוֹן מוּאָר.",
      alt: "בית קטן על גבעה, ובחלון שלו דולק אור",
      art: nightBase() + a.hills(470, "#2F5D50") + a.ground(520, "#274C43") + a.house(400, 520, 1.7, true, "#E8D2B0", "#A8483A") +
        a.starChar(640, 130, 0.9, "smile"),
    },
    {
      text: "הכוכב עוצם עיניים. ששש... לילה טוב.",
      textNikud: "הַכּוֹכָב עוֹצֵם עֵינַיִם. שְׁשְׁשְׁ... לַיְלָה טוֹב.",
      alt: "הכוכב הקטן ישן על ענן, והירח ישן לידו",
      art: nightBase() + a.moonChar(650, 140, 0.8, "sleep") + a.starChar(380, 250, 1.7, "sleep") +
        a.cloud(380, 480, 2.8, "#C9CCF0", 0.95),
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. The snail who was late to the party (3-5)
// ---------------------------------------------------------------------------

const meadow = () => a.daySky() + a.hills(430) + a.ground(480);

const snail: SeedStory = {
  id: "seed-snail",
  slug: "the-snail-who-was-late",
  title: "השבלול שאיחר למסיבה",
  summary: "שוקי השבלול יוצא מוקדם למסיבת יום ההולדת של החיפושית, אבל בדרך הוא עוצר לעזור לנמלה ולפרפר. כשהוא מגיע, המסיבה כבר נגמרה. או שאולי רק מתחילה?",
  ageGroup: "3-5",
  readingMinutes: 5,
  categories: ["friendship", "animals", "values"],
  tags: ["יום הולדת", "גשם", "גינה"],
  themes: ["kindness", "friendship", "patience"],
  discussionQuestions: [
    "למה שוקי איחר למסיבה?",
    "איך הרגיש שוקי כשראה שהמסיבה נגמרה?",
    "מתי עזרת למישהו גם כשמיהרת?",
    "מה החברים עשו כדי לשמח את שוקי?",
  ],
  viewCount: 412,
  publishedAt: "2026-09-16T07:00:00.000Z",
  cover: a.cover(
    "השבלול שאיחר למסיבה",
    a.eveningSky(600, 560) + a.sun(480, 120, 46, "#FF9E5E") + a.hills(400, "#A9DDA0", 600, 560) + a.ground(450, "#8FD08A", 600, 560) +
      a.mushroom(130, 470, 1) + a.balloon(120, 250, 1, "#FF8FA3") + a.balloon(180, 230, 1, "#8EC9F0") +
      a.gift(310, 395, 1.2) + a.snail(330, 510, 1.5) + a.grass(0, 560, 600),
    "#D9480F",
  ),
  pages: [
    {
      text: "בבוקר מצא שוקי השבלול הזמנה על עלה: ״מסיבת יום הולדת לחיפושית! היום, ליד הפטרייה הגדולה.״",
      alt: "שוקי השבלול מסתכל על עלה גדול שעליו מצוירים בלון ועוגה",
      art: a.morningSky() + a.sun(120, 110, 44) + a.hills(430) + a.ground(480) + a.bigLeaf(300, 380, 1.5) +
        a.balloon(250, 340, 0.6, "#FF8FA3", 40) + a.cake(340, 360, 0.6) + a.snail(560, 530, 1.5, "wow") + a.grass(0, 600, 800),
    },
    {
      text: "״אני איטי,״ אמר שוקי, ״אז אצא כבר עכשיו.״ הוא שם מתנה קטנה על הגב והתחיל לזחול.",
      alt: "שוקי זוחל בשביל עם מתנה כחולה קטנה על הקונכייה",
      art: meadow() + a.sun(690, 100, 44) +
        `<path d="M0 560 Q 300 500 800 540" stroke="#E9C99A" stroke-width="50" fill="none"/>` +
        a.flower(120, 500, 1.1) + a.flower(700, 490, 1, "#C59CF0") + a.gift(275, 392, 1.3) + a.snail(300, 540, 1.6),
    },
    {
      text: "בדרך פגש נמלה. היא משכה פירור ענק ולא הצליחה להזיז אותו. ״חכי, אני אעזור,״ אמר שוקי, ודחף יחד איתה עד הקן.",
      alt: "שוקי ונמלה קטנה דוחפים יחד פירור גדול",
      art: meadow() + a.sun(120, 100, 44) + a.crumb(450, 540, 2) + a.ant(600, 545, 1.6) + a.gift(150, 412, 1.1) +
        a.snail(170, 540, 1.4) + a.grass(640, 600, 160),
    },
    {
      text: "אחר כך התחיל לרדת גשם. פרפר רטוב רעד על גבעול. ״בוא, תתחבא ליד הקונכייה שלי,״ אמר שוקי. הם חיכו יחד עד שהגשם נגמר.",
      alt: "גשם יורד, ופרפר סגול מסתתר מתחת לעלה ליד שוקי",
      art: a.greySky() + a.cloud(200, 110, 1.6, "#7F8FA6") + a.cloud(560, 90, 1.8, "#7F8FA6") + a.hills(430, "#93C79A") +
        a.ground(480, "#7DBF85") + a.rain() + a.bigLeaf(560, 360, 1.5, "#5DB075") + a.butterfly(600, 470, 1.4, "#C59CF0", true) +
        a.gift(235, 402, 1.2) + a.snail(260, 540, 1.5),
    },
    {
      text: "השמש כבר ירדה. שוקי זחל וזחל. ״מהר, מהר,״ אמר לעצמו, אבל הרגליים... רגע, לשבלול אין רגליים בכלל!",
      alt: "שוקי זוחל במהירות בשעת שקיעה, והשמש כבר נמוכה",
      art: a.eveningSky() + a.sun(650, 380, 60, "#FF9E5E") + a.hills(430, "#9CCB8F") + a.ground(480, "#7DBF85") +
        `<path d="M40 500 h 90 M70 470 h 70 M30 530 h 60" stroke="#FFFFFF" stroke-width="6" opacity="0.7"/>` +
        a.gift(335, 392, 1.3) + a.snail(360, 540, 1.6, "wow"),
    },
    {
      text: "כשהגיע לפטרייה הגדולה, כבר היה חושך. הבלונים נחו על הדשא. המסיבה נגמרה. שוקי הוריד את הראש.",
      alt: "לילה. שוקי עצוב ליד פטרייה גדולה, ובלונים מונחים על הדשא",
      art: nightBase() + a.hills(430, "#2F5D50") + a.ground(480, "#274C43") + a.mushroom(560, 520, 1.8) +
        a.balloon(70, 570, 0.9, "#B56F80", 0) + a.balloon(140, 576, 0.9, "#6A93B3", 0) + a.gift(325, 412, 1.1) +
        a.snail(345, 540, 1.4, "sad"),
    },
    {
      text: "״שוקי!״ קראה החיפושית. ״הנמלה והפרפר סיפרו לנו למה איחרת. שמרנו לך את הפרוסה הכי גדולה!״",
      alt: "החיפושית, הנמלה והפרפר מחכים לשוקי עם עוגה",
      art: nightBase() + a.hills(430, "#2F5D50") + a.ground(480, "#274C43") + a.mushroom(640, 520, 1.5) +
        a.cake(450, 545, 1.5) + a.ladybug(580, 545, 1.1) + a.ant(340, 548, 1.2) + a.butterfly(430, 330, 1.1) +
        a.snail(150, 545, 1.3, "wow") + a.fireflies([[120, 200], [300, 150], [700, 220]]),
    },
    {
      text: "הגחליליות הדליקו אורות קטנים, וכולם רקדו שוב. זאת הייתה המסיבה השנייה של אותו יום, ושוקי הגיע אליה בדיוק בזמן.",
      alt: "כל החברים רוקדים בלילה מתחת לאורות של גחליליות",
      art: nightBase() + a.hills(430, "#2F5D50") + a.ground(480, "#274C43") +
        a.fireflies([[100, 180], [220, 260], [340, 140], [460, 240], [580, 160], [700, 250], [400, 330], [640, 360], [160, 380]]) +
        a.balloon(660, 330, 1.1, "#FF8FA3") + a.balloon(720, 300, 1.1, "#8EC9F0") + a.ladybug(650, 548, 1.1, "laugh") +
        a.butterfly(300, 300, 1.2) + a.ant(130, 548, 1.2) + a.snail(380, 545, 1.5, "laugh"),
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Tamar's yellow boots (3-5)
// ---------------------------------------------------------------------------

const tamarLook = { shirt: "#E0554A", pants: "#4B5D8A", hair: "#3B2A20", hairStyle: "pigtails" as const };
const room = () => a.floor(470);

const bootsStory: SeedStory = {
  id: "seed-boots",
  slug: "tamars-yellow-boots",
  title: "המגפיים הצהובים של תמר",
  summary: "תמר מחכה לגשם כדי לנעול את המגפיים החדשים שלה. אבל כשהגשם סוף סוף מגיע, מגיע איתו גם רעם. סיפור על פחד קטן ועל דרך פשוטה להרגיע אותו.",
  ageGroup: "3-5",
  readingMinutes: 5,
  categories: ["overcoming", "nature", "home-education"],
  tags: ["חורף", "גשם"],
  themes: ["courage", "feelings", "patience"],
  discussionQuestions: [
    "ממה תמר נבהלה?",
    "מה אבא הציע לה לעשות כשהיא שומעת רעם?",
    "מה עוזר לך כשמשהו מפחיד?",
    "איך תמר הרגישה בסוף הסיפור?",
  ],
  viewCount: 287,
  publishedAt: "2026-09-23T07:00:00.000Z",
  cover: a.cover(
    "המגפיים הצהובים של תמר",
    a.greySky(600, 560) + a.cloud(140, 100, 1.4, "#7F8FA6") + a.cloud(440, 80, 1.5, "#7F8FA6") +
      a.ground(440, "#7DBF85", 600, 560) + a.puddle(300, 520, 1.9) + a.splash(300, 505, 1.1) +
      a.person(300, 520, 1.5, { ...tamarLook, boots: "#FFD23F", cheer: true, mood: "laugh" }),
    "#F2B705",
    "#3B2F2A",
  ),
  pages: [
    {
      text: "תמר קיבלה מגפיים צהובים חדשים. הם הבריקו כמו שני לימונים.",
      alt: "תמר מחזיקה את הידיים למעלה מרוב שמחה ליד זוג מגפיים צהובים",
      art: room() + a.rug(400, 530, 520) + a.boots(540, 540, 1.8) + a.person(280, 545, 1.4, { ...tamarLook, cheer: true, mood: "laugh" }),
    },
    {
      text: "״מתי ירד גשם?״ שאלה תמר כל בוקר. אבל השמיים היו כחולים, והמגפיים חיכו ליד הדלת.",
      alt: "תמר מסתכלת מהחלון על שמיים כחולים, והמגפיים עומדים ליד הדלת",
      art: room() + a.windowFrame(50, 90, 300, 240, a.daySky() + a.sun(260, 160, 40) + a.cloud(130, 260, 0.8)) +
        a.door(690, 470, 1.25) + a.boots(560, 545, 1.2) + a.person(430, 550, 1.3, { ...tamarLook, mood: "flat" }),
    },
    {
      text: "יום אחד השמיים האפירו. טיפה נחתה על החלון. ועוד טיפה. ״גשם!״ צעקה תמר ורצה אל המגפיים.",
      alt: "מחוץ לחלון יורד גשם, ותמר רצה אל המגפיים בידיים מורמות",
      art: room() + a.windowFrame(90, 90, 300, 240, a.greySky() + a.cloud(200, 150, 1.4, "#7F8FA6") + a.rain("#4F86C6", 40)) +
        a.boots(640, 545, 1.4) + a.person(420, 550, 1.3, { ...tamarLook, cheer: true, mood: "laugh" }),
    },
    {
      text: "ואז נשמע רעם גדול. בום! תמר קפצה אל מתחת לשמיכה. ״אני לא יוצאת,״ לחשה.",
      alt: "ברק מאיר את החלון, ותמר מציצה מתחת לשמיכה במיטה",
      art: a.floor(470, "#C9AE86", "#D9DDE8") +
        a.windowFrame(520, 70, 220, 220, a.sky("#5B6B86", "#8E9BB3") + a.lightning(640, 80, 0.9) + a.rain("#C9D6EA", 30)) +
        a.bed(330, 560, 1.4) + `<circle cx="212" cy="418" r="40" fill="#F6C9A0"/><path d="M172 410 q 40 -50 80 0 q -40 -14 -80 0 Z" fill="#3B2A20"/>` +
        `<circle cx="198" cy="424" r="6" fill="#3B2F2A"/><circle cx="226" cy="424" r="6" fill="#3B2F2A"/><ellipse cx="212" cy="442" rx="6" ry="7" fill="#3B2F2A"/>` +
        a.speech(180, 150, "בום!", 170),
    },
    {
      text: "אבא התיישב לידה. ״הרעם הוא רק קול,״ אמר. ״כשאני שומע אותו, אני סופר עד שלוש ונושם עמוק. רוצה לנסות?״",
      alt: "אבא יושב ליד תמר על המיטה ומדבר איתה ברוגע",
      art: a.floor(470, "#C9AE86", "#FFF0D6") +
        a.windowFrame(560, 60, 200, 200, a.greySky() + a.rain("#4F86C6", 30)) + a.bed(250, 520, 1.1) +
        a.person(560, 570, 1.75, { shirt: "#3F8F7B", pants: "#3B4A6B", hair: "#2B211C", mood: "smile" }) +
        a.person(330, 575, 1.2, { ...tamarLook, mood: "flat" }),
    },
    {
      text: "בום! ״אחת, שתיים, שלוש,״ ספרה תמר ונשמה עמוק. הלב שלה עוד דפק, אבל קצת פחות.",
      alt: "תמר עומדת בעיניים עצומות וסופרת, ומעליה המספרים אחת, שתיים, שלוש",
      art: a.floor(470, "#C9AE86", "#FFF0D6") +
        a.windowFrame(540, 70, 200, 200, a.greySky() + a.lightning(650, 80, 0.7) + a.rain("#4F86C6", 30)) +
        a.rug(330, 540, 460) + a.person(330, 550, 1.5, { ...tamarLook, mood: "sleep" }) +
        `<g font-family="Rubik, 'Segoe UI', 'Arial Hebrew', Arial, Tahoma, sans-serif" font-weight="800" font-size="72" text-anchor="middle"><text x="130" y="170" fill="#E0554A">1</text><text x="250" y="130" fill="#F2B705">2</text><text x="380" y="160" fill="#3F8F7B">3</text></g>`,
    },
    {
      text: "היא נעלה את המגפיים הצהובים ויצאה לחצר. שלולית ראשונה: שפריץ! שלולית שנייה: שפריץ גדול עוד יותר!",
      alt: "תמר קופצת בשלולית במגפיים הצהובים, והמים ניתזים לכל עבר",
      art: a.greySky() + a.cloud(160, 100, 1.5, "#7F8FA6") + a.cloud(600, 120, 1.6, "#7F8FA6") + a.rain("#4F86C6", 22) +
        a.hills(440, "#93C79A") + a.ground(480, "#7DBF85") + a.puddle(400, 548, 2.4) + a.splash(400, 530, 1.5) +
        a.person(400, 540, 1.5, { ...tamarLook, boots: "#FFD23F", cheer: true, mood: "laugh" }) + a.puddle(120, 570, 0.9),
    },
    {
      text: "הרעם נשמע שוב, רחוק רחוק. תמר ספרה עד שלוש וחייכה. ״שמעת, רעם? אני כאן, עם המגפיים שלי.״",
      alt: "הגשם נחלש וקשת מופיעה בשמיים. תמר עומדת בגאווה במגפיים הצהובים",
      art: a.sky("#B9CDE0", "#EAF2F8") + a.cloud(640, 110, 1.4, "#9FB0C4") +
        `<g fill="none" stroke-width="16"><path d="M80 470 A 300 300 0 0 1 680 470" stroke="#E0554A"/><path d="M96 470 A 284 284 0 0 1 664 470" stroke="#F2B705"/><path d="M112 470 A 268 268 0 0 1 648 470" stroke="#58C27D"/><path d="M128 470 A 252 252 0 0 1 632 470" stroke="#5AA9E6"/></g>` +
        a.hills(440, "#93C79A") + a.ground(480, "#7DBF85") + a.puddle(600, 560, 1.2) +
        a.person(360, 550, 1.6, { ...tamarLook, boots: "#FFD23F", mood: "smile" }),
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. Grandma Ruth's map (6-8)
// ---------------------------------------------------------------------------

const yoav = { shirt: "#58C27D", pants: "#4B5D8A", hair: "#5B3A29", hairStyle: "short" as const };
const noga = { shirt: "#C59CF0", pants: "#6B4B8A", hair: "#2B211C", hairStyle: "long" as const };
const grandma = { shirt: "#E58F7B", pants: "#7A5A6B", hair: "#DADADA", hairStyle: "bun" as const, glasses: true };
const street = () =>
  a.daySky() + a.building(0, 420, 200, 300, "#F0DFC2") + a.building(210, 420, 180, 240, "#E8D2B0") +
  a.building(600, 420, 200, 280, "#F0DFC2") + `<rect y="420" width="800" height="180" fill="#D9D2C5"/><rect y="420" width="800" height="14" fill="#BDB5A6"/>`;

const map: SeedStory = {
  id: "seed-map",
  slug: "grandma-ruths-map",
  title: "המפה של סבתא רות",
  summary: "יואב מוצא במגירה של סבתא מפה ישנה שהיא ציירה כשהייתה ילדה, ובפינה שלה איקס אדום. יחד עם אחותו נוגה הוא יוצא לחפש מה מחכה שם, ברחובות ששינו את פניהם.",
  ageGroup: "6-8",
  readingMinutes: 9,
  categories: ["adventures", "friendship", "values"],
  tags: ["סבא וסבתא", "אחים", "קיץ"],
  themes: ["curiosity", "family", "patience", "perseverance"],
  discussionQuestions: [
    "איך יואב ונוגה הבינו שהמזרקה היא הבאר שבמפה?",
    "למה לדעתכם ההמתנה על הספסל הייתה החלק הכי קשה?",
    "מה הייתם מוסיפים לקופסה אילו מצאתם אותה?",
    "למה נוגה ענתה לסבתא ״סוד״?",
    "איזה מקום ליד הבית שלכם השתנה מאז שהייתם קטנים?",
  ],
  viewCount: 356,
  publishedAt: "2026-09-30T07:00:00.000Z",
  cover: a.cover(
    "המפה של סבתא רות",
    a.morningSky(600, 560) + a.sun(500, 100, 40) + a.ground(430, "#E9C99A", 600, 560) + a.figTree(110, 450, 0.9) +
      a.paperMap(300, 300, 1.5, -6) + a.person(170, 550, 0.95, { ...yoav, mood: "wow" }) + a.person(440, 550, 0.95, { ...noga }),
    "#8A5A2B",
  ),
  pages: [
    {
      text: "ביום שישי אחד עזר יואב לסבתא רות לסדר את המגירה הישנה שלה. בין כפתורים, מכתבים ומפתח חלוד הוא מצא דף מקופל לארבע. על הדף היה ציור של רחובות, עץ, באר, ובפינה איקס אדום.",
      alt: "יואב עומד ליד שידה עם מגירה פתוחה ומחזיק מפה מצוירת ביד",
      art: room() + a.rug(420, 540, 560, "#8FB7C9") + a.drawer(570, 520, 1.2) + a.person(230, 550, 1.4, { ...yoav, mood: "wow", cheer: true }) +
        a.paperMap(120, 190, 0.8, -8),
    },
    {
      text: "״מה זה?״ שאל יואב. סבתא רות הרכיבה משקפיים והביטה בדף זמן רב. ״ציירתי את זה כשהייתי בת שמונה,״ אמרה לבסוף וחייכה. ״אבל מה מחכה ליד האיקס, את זה כבר שכחתי. תצטרכו לגלות בעצמכם.״",
      alt: "סבתא רות עם משקפיים מסתכלת על המפה ומחייכת ליואב",
      art: room() + a.rug(400, 540, 560, "#8FB7C9") + a.paperMap(400, 250, 1.1, 4) +
        a.person(590, 555, 1.65, { ...grandma, mood: "smile" }) + a.person(220, 550, 1.35, { ...yoav }),
    },
    {
      text: "יואב קרא לאחותו נוגה. הם פרשו את המפה על המדרכה. ״מתחילים בעץ התאנה,״ קראה נוגה. ״אבל ברחוב שלנו אין עץ תאנה.״ יואב הצביע אל סוף הרחוב. מאחורי תחנת האוטובוס עמד עץ זקן ורחב, והעלים שלו נראו כמו כפות ידיים.",
      alt: "יואב ונוגה ברחוב, ומאחוריהם עץ תאנה גדול וזקן",
      art: street() + a.figTree(500, 440, 1.25) + a.paperMap(250, 540, 0.8, 8) + a.person(130, 560, 1.15, { ...noga }) +
        a.person(360, 565, 1.2, { ...yoav, cheer: true, mood: "wow" }),
    },
    {
      text: "״מהתאנה, ארבעים צעדים לכיוון הבאר,״ היה כתוב במפה. הם ספרו בקול. אחרי ארבעים צעדים לא הייתה שם שום באר. הייתה רק כיכר קטנה, ובאמצע שלה מזרקה.",
      alt: "כיכר קטנה עם מזרקה, והילדים עומדים מולה מבולבלים",
      art: street() + a.fountain(520, 540, 1.5) + a.person(130, 565, 1.15, { ...noga, mood: "flat" }) +
        a.person(270, 570, 1.2, { ...yoav, mood: "flat" }) + a.speech(200, 120, "ארבעים!", 220),
    },
    {
      text: "נוגה הקיפה את המזרקה פעמיים. ״תראה את האבנים למטה,״ אמרה. ״הן ישנות יותר מכל השאר.״ יואב הבין ראשון: ״המזרקה היא הבאר! פשוט בנו אותה מחדש.״",
      alt: "נוגה מצביעה על האבנים הישנות בבסיס המזרקה",
      art: a.daySky() + `<rect y="380" width="800" height="220" fill="#D9D2C5"/>` + a.fountain(430, 560, 2.3) +
        a.person(130, 580, 1.2, { ...noga, cheer: true, mood: "wow" }) + a.person(700, 580, 1.2, { ...yoav, mood: "laugh" }),
    },
    {
      text: "השורה האחרונה במפה הייתה הקשה ביותר: ״מהבאר, לכי אל המקום שבו השמש נוגעת בחומה בשעה ארבע.״ השעה הייתה רק שלוש. הם ישבו על הספסל, אכלו תפוח וחיכו. לחכות היה החלק הכי קשה בכל המסע.",
      alt: "יואב ונוגה יושבים על ספסל מול חומת אבן ומחכים",
      art: a.daySky() + a.sun(660, 110, 44) + a.stoneWall(200, 240) + `<rect y="440" width="800" height="160" fill="#D9D2C5"/>` +
        a.bench(400, 560, 2) + a.person(310, 520, 1.05, { ...noga, mood: "flat" }) + a.person(490, 520, 1.1, { ...yoav, mood: "flat" }) +
        `<circle cx="400" cy="440" r="16" fill="#E0554A"/><path d="M400 424 q 6 -12 14 -12" stroke="#4E9F5B" stroke-width="4" fill="none"/>`,
    },
    {
      text: "בדיוק בארבע נפלה קרן שמש צרה בין שני בניינים והאירה אבן אחת בחומה הישנה. האבן הייתה רופפת. יואב משך אותה בזהירות, ומאחוריה, בתוך גומחה קטנה, חיכתה קופסת פח.",
      alt: "קרן שמש מאירה אבן אחת בחומה, ויואב מושיט אליה יד",
      art: a.sky("#FFD9A0", "#FFF0D0") + a.stoneWall(120, 340, [4, 3]) + a.sunbeam(400, 490, 500, 295) +
        `<rect y="460" width="800" height="140" fill="#D9D2C5"/>` + a.person(300, 580, 1.3, { ...yoav, cheer: true, mood: "wow" }) +
        a.person(640, 580, 1.2, { ...noga, mood: "wow" }),
    },
    {
      text: "בקופסה היו שש גולות, נוצה כחולה ופתק בכתב יד עגול: ״למי שמצא: עכשיו תורך. הוסף משהו משלך והחבא את הקופסה שוב. רות, בת שמונה.״",
      alt: "קופסת פח פתוחה עם גולות צבעוניות ונוצה כחולה, ולידה פתק",
      art: a.sky("#FFE2B8", "#FFF5DC") + `<rect y="400" width="800" height="200" fill="#D9D2C5"/>` + a.tinBox(280, 500, 2.4, true) +
        a.note(590, 330, 1.5),
    },
    {
      text: "יואב הוסיף לקופסה את מחזיק המפתחות שלו, ונוגה הוסיפה ציור קטן. הם החזירו את האבן למקומה ורצו הביתה. ״נו, מה מצאתם?״ שאלה סבתא רות. ״סוד,״ ענתה נוגה. ״אבל ציירנו מפה חדשה, למי שיבוא אחרינו.״",
      alt: "הילדים מראים לסבתא רות מפה חדשה שציירו, וכולם מחייכים",
      art: room() + a.rug(400, 540, 600, "#8FB7C9") + a.paperMap(400, 210, 1, -5) +
        a.person(400, 555, 1.65, { ...grandma, mood: "laugh" }) + a.person(170, 555, 1.25, { ...noga, mood: "laugh" }) +
        a.person(630, 555, 1.3, { ...yoav, mood: "laugh" }),
    },
  ],
};

// ---------------------------------------------------------------------------
// 6. The robot who could not laugh (6-8)
// ---------------------------------------------------------------------------

const lia = { shirt: "#F2B705", pants: "#3F8F7B", hair: "#7A3B1E", hairStyle: "pigtails" as const };
const liaRoom = () => a.floor(470, "#D9B98C", "#E3F1F5");

const robotStory: SeedStory = {
  id: "seed-robot",
  slug: "the-robot-who-could-not-laugh",
  title: "הרובוט שלא ידע לצחוק",
  summary: "ליה בונה רובוט מקופסאות קרטון וקוראת לו בורג. הוא עושה בדיוק מה שמבקשים ממנו, מילה במילה, ורק דבר אחד לא מותקן אצלו: צחוק. ליה מחליטה ללמד אותו.",
  ageGroup: "6-8",
  readingMinutes: 8,
  categories: ["humor", "fantasy", "friendship"],
  tags: ["המצאות", "חתולים"],
  themes: ["patience", "imagination", "friendship", "perseverance"],
  discussionQuestions: [
    "למה בורג חיפש את ״המבט״ במגירות?",
    "איזו בדיחה הייתם מספרים לבורג?",
    "מה גרם לבורג לצחוק בסוף?",
    "האם אפשר ללמד מישהו לצחוק? למה?",
    "מה פירוש ״שגוי וגם נעים״? יש לכם דוגמה?",
  ],
  viewCount: 198,
  publishedAt: "2026-10-07T07:00:00.000Z",
  cover: a.cover(
    "הרובוט שלא ידע לצחוק",
    a.sky("#D5F1F5", "#F2FBFC", 600, 560) + `<rect y="430" width="600" height="130" fill="#D9B98C"/>` + a.rug(300, 500, 460, "#E58F7B") +
      a.robot(370, 520, 1.25, "think") + a.person(150, 525, 1.1, { ...lia, mood: "laugh" }) + a.sleepingCat(372, 182, 0.9),
    "#0B7285",
  ),
  pages: [
    {
      text: "ליה בנתה רובוט משלוש קופסאות קרטון, שני מכסים של צנצנות וקפיץ אחד. היא קראה לו בורג. כשלחצה על הכפתור הירוק, העיניים שלו נדלקו. ״שלום, ליה,״ אמר בורג. ״אני מוכן לעזור.״",
      alt: "ליה עומדת ליד רובוט מקרטון שעיניו דולקות בירוק",
      art: liaRoom() + a.rug(420, 540, 560) + a.robot(540, 550, 1.45, "on") + a.person(230, 550, 1.35, { ...lia, cheer: true, mood: "laugh" }) +
        a.speech(560, 70, "שלום, ליה", 240),
    },
    {
      text: "בורג עשה כל מה שביקשו ממנו, בדיוק כמו שביקשו. כשליה אמרה ״תזרוק מבט על החדר שלי,״ הוא חיפש בכל המגירות ושאל: ״איפה שמת את המבט? אני לא מוצא מה לזרוק.״",
      alt: "בורג הרובוט מחפש בתוך מגירה פתוחה, וליה מסתכלת עליו בהפתעה",
      art: liaRoom() + a.drawer(570, 530, 1.15) + a.robot(330, 555, 1.35, "think") + a.person(110, 555, 1.2, { ...lia, mood: "wow" }) +
        a.speech(330, 70, "איפה המבט?", 280),
    },
    {
      text: "ליה צחקה עד שכאבה לה הבטן. בורג הביט בה. ״הפנים שלך מתקמטות ויוצא ממך רעש,״ אמר. ״האם התקלקלת?״ ״לא התקלקלתי,״ אמרה ליה, ״אני צוחקת! אתה לא יודע לצחוק?״ ״לא מותקן אצלי,״ ענה בורג.",
      alt: "ליה צוחקת בקול, ובורג מביט בה בלי להבין",
      art: liaRoom() + a.rug(400, 540, 600) + a.person(250, 550, 1.45, { ...lia, cheer: true, mood: "laugh" }) + a.robot(560, 555, 1.4, "think") +
        `<g font-family="Rubik, 'Segoe UI', 'Arial Hebrew', Arial, Tahoma, sans-serif" font-weight="800" font-size="44" fill="#D9480F" text-anchor="middle"><text x="110" y="150" transform="rotate(-12 110 150)">חה</text><text x="230" y="100">חה</text><text x="350" y="150" transform="rotate(10 350 150)">חה</text></g>`,
    },
    {
      text: "ליה החליטה ללמד אותו. היא סיפרה לו בדיחה: ״מה אמר האפס לשמונה? חגורה יפה!״ בורג חשב שבע שניות. ״אפס הוא מספר. מספרים לא מדברים. הבדיחה שגויה,״ קבע.",
      alt: "ליה מספרת בדיחה, ומעליה מצוירות הספרות אפס ושמונה",
      art: liaRoom() + a.rug(400, 540, 600) + a.person(220, 550, 1.35, { ...lia, mood: "smile" }) + a.robot(570, 555, 1.4, "think") +
        `<g font-family="Rubik, 'Segoe UI', 'Arial Hebrew', Arial, Tahoma, sans-serif" font-weight="800" font-size="120" text-anchor="middle"><text x="330" y="190" fill="#5AA9E6">0</text><text x="450" y="190" fill="#E0554A">8</text></g>` +
        `<rect x="414" y="140" width="72" height="12" rx="6" fill="#3B2F2A"/>`,
    },
    {
      text: "היא ניסתה פרצופים מצחיקים. היא ניסתה ללכת כמו פינגווין. היא אפילו שמה גרב על האף. בורג רשם הכול בפנקס: ״גרב על אף: לא יעיל. האף אינו רגל.״",
      alt: "ליה עם גרב אדום על האף, ובורג רושם בפנקס",
      art: liaRoom() + a.rug(400, 540, 600) + a.person(240, 550, 1.45, { ...lia, cheer: true, mood: "smile" }) + a.sock(246, 268, 1.3) +
        a.robot(570, 555, 1.4, "on") + a.notebook(470, 370, 1.1),
    },
    {
      text: "בערב ישבה ליה על השטיח, עייפה. ״אולי אי אפשר ללמד לצחוק,״ אמרה. בורג התיישב לידה. ״אני מצטער שלא הצלחתי,״ אמר. ״ניסית יפה מאוד.״",
      alt: "ערב. ליה ובורג יושבים זה ליד זה על השטיח, שניהם עצובים קצת",
      art: a.floor(470, "#C9A97C", "#D8D2E8") + a.windowFrame(90, 80, 220, 200, a.eveningSky() + a.sun(200, 250, 40, "#FF9E5E")) +
        a.rug(430, 545, 620, "#C97B6B") + a.person(300, 560, 1.15, { ...lia, mood: "sad" }) + a.robot(520, 565, 1.15, "sad"),
    },
    {
      text: "בדיוק אז קפץ החתול שמשון על הראש של בורג, התכרבל שם כמו כובע פרוותי, והתחיל לגרגר. הקפיץ של בורג רעד. המכסים שלו קרקשו. ״חה,״ יצא ממנו פתאום. ״חה. חה-חה-חה!״",
      alt: "חתול אפור מכורבל על הראש של בורג, ובורג צוחק ורועד",
      art: a.floor(470, "#C9A97C", "#D8D2E8") + a.rug(430, 545, 620, "#C97B6B") + a.robot(480, 560, 1.5, "laugh") +
        a.sleepingCat(484, 148, 1.25) + a.person(190, 560, 1.25, { ...lia, mood: "wow" }) + a.speech(680, 250, "חה!", 150),
    },
    {
      text: "״אתה צוחק!״ קראה ליה. ״החתול חושב שאני כיסא,״ אמר בורג, והמשיך לקרקש. ״זה שגוי. וזה... נעים.״ מאז, בכל פעם שמשהו שגוי וגם נעים, בורג צוחק. וליה צוחקת איתו.",
      alt: "ליה ובורג צוחקים יחד, והחתול עדיין ישן על הראש של בורג",
      art: liaRoom() + a.rug(400, 540, 620) + a.robot(520, 558, 1.45, "laugh") + a.sleepingCat(524, 160, 1.2) +
        a.person(250, 555, 1.4, { ...lia, cheer: true, mood: "laugh" }) +
        `<g font-family="Rubik, 'Segoe UI', 'Arial Hebrew', Arial, Tahoma, sans-serif" font-weight="800" font-size="40" fill="#D9480F" text-anchor="middle"><text x="110" y="120" transform="rotate(-10 110 120)">חה חה</text><text x="700" y="110" transform="rotate(8 700 110)">חה חה</text></g>`,
    },
  ],
};

export const STORIES: SeedStory[] = [garden, star, snail, bootsStory, map, robotStory];

export const SEED_AUTHOR = "מערכת הסיפור שלי";
export const SEED_ILLUSTRATOR = "מערכת הסיפור שלי";
export const SEED_LICENSE = "CC BY 4.0";
export const SEED_SOURCE = "סיפור מקורי שנכתב ואויר במיוחד לאתר, בעזרת בינה מלאכותית";

export const SEED_COLLECTIONS = [
  {
    id: "seed-col-bedtime",
    slug: "sweet-dreams",
    title: "חלומות מתוקים",
    description: "סיפורים רגועים וקצרים לדקות האחרונות של היום, כשהאור כבר מעומעם.",
    bookIds: ["seed-star", "seed-garden", "seed-snail"],
  },
  {
    id: "seed-col-winter",
    slug: "rainy-days",
    title: "ימים של גשם",
    description: "שלוליות, מגפיים ורעמים רחוקים: ספרים לימי חורף שנשארים בהם בבית.",
    bookIds: ["seed-boots", "seed-snail"],
    season: "winter",
  },
];

export const SEED_BOOK_OF_THE_WEEK = "seed-snail";
