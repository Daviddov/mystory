/**
 * Demo data returned by the MOCK text provider for each pipeline step, so the
 * whole wizard works without an API key. It is a fixed template with the
 * hero's name filled in, and it says so: the title and the summary are
 * labelled as a sample. It does not use the parent's story idea.
 */
import type { WizardInput } from "./input";
import { AGE_WRITING_RULES } from "./options";
import type { CharacterSheet, Outline, Review, StoryMetadata, StoryPage } from "./prompts";

export const MOCK_TITLE_SUFFIX = "(סיפור לדוגמה)";

interface Forms {
  name: string;
  /** Picks the masculine or feminine form. */
  g: (masculine: string, feminine: string) => string;
  hobby: string;
}

function forms(input: WizardInput): Forms {
  const girl = input.childGender === "girl";
  return {
    name: input.childName,
    g: (masculine, feminine) => (girl ? feminine : masculine),
    hobby: input.hobbies[0] ?? "ציור",
  };
}

function toddlerPages({ name }: Forms): StoryPage[] {
  return [
    { text: `בוקר טוב, ${name}! השמש קמה.`, illustrationPrompt: "Morning in a cosy bedroom, the hero stretching in bed as the sun rises in the window" },
    { text: `${name} רואה ציפור. ציף ציף!`, illustrationPrompt: "The hero pointing at a small bird on a branch outside" },
    { text: `${name} רואה כלב. הב הב!`, illustrationPrompt: "The hero waving at a friendly puppy in a garden" },
    { text: `${name} רואה חתול. מיאו!`, illustrationPrompt: "The hero crouching next to a sleepy ginger cat" },
    { text: `איפה ${name}? הנה ${name}!`, illustrationPrompt: "The hero playing peekaboo from behind a big soft blanket" },
    { text: `לילה טוב, ${name}. הירח קם.`, illustrationPrompt: "Evening, the hero tucked in bed, a round moon in the window" },
  ];
}

function preschoolPages({ name, g, hobby }: Forms): StoryPage[] {
  return [
    {
      text: `${name} ${g("התעורר", "התעוררה")} בבוקר עם רעיון גדול. ״היום יוצאים להרפתקה!״ ${g("הוא קרא", "היא קראה")}.`,
      illustrationPrompt: "Morning, the hero jumping out of bed with arms in the air, sunlight in the room",
    },
    {
      text: `${g("הוא ארז", "היא ארזה")} תיק קטן: בקבוק מים, תפוח אדום, ומשהו אחד שקשור ל${hobby}.`,
      illustrationPrompt: "The hero packing a small backpack with a water bottle and a red apple",
    },
    {
      text: `בדרך ${g("פגש", "פגשה")} ${name} חתול ג׳ינג׳י. ״לאן?״ שאל החתול. ״להרפתקה!״ ${g("ענה", "ענתה")} ${name}.`,
      illustrationPrompt: "A garden path, the hero meeting a ginger cat sitting on a low wall",
    },
    {
      text: `פתאום הדרך נגמרה. לפניהם עמדה גבעה גבוהה. ${name} ${g("עצר וחשב", "עצרה וחשבה")}: מה עושים עכשיו?`,
      illustrationPrompt: "The hero and the ginger cat looking up at a tall green hill, the path ending in grass",
    },
    {
      text: `״צעד אחד, ועוד צעד,״ לחש החתול. ${name} ${g("לקח", "לקחה")} נשימה עמוקה ${g("והתחיל", "והתחילה")} לטפס.`,
      illustrationPrompt: "The hero climbing the grassy hill step by step, the cat walking alongside",
    },
    {
      text: "צעד אחד, ועוד צעד. ועוד אחד קטן. והנה, הם למעלה! מאחורי הגבעה חיכתה הפתעה צבעונית.",
      illustrationPrompt: "The top of the hill, a wide colourful meadow full of flowers and kites beyond it",
    },
    {
      text: `${name} ${g("צחק ורקד", "צחקה ורקדה")}, והחתול רקד גם הוא. איזה כיף לגלות מקום חדש!`,
      illustrationPrompt: "The hero and the ginger cat dancing among flowers and flying kites",
    },
    {
      text: `בערב ${g("חזר", "חזרה")} ${name} הביתה, ${g("עייף ושמח", "עייפה ושמחה")}. מחר תהיה הרפתקה חדשה.`,
      illustrationPrompt: "Sunset, the hero walking home with the backpack, the cat waving goodbye from the wall",
    },
  ];
}

function readerPages({ name, g, hobby }: Forms): StoryPage[] {
  return [
    {
      text: `בבוקר יום שישי ${g("מצא", "מצאה")} ${name} מעטפה כחולה מתחת לדלת. בפנים הייתה מפה מצוירת ביד, ועליה איקס אדום קטן. מי שלח אותה? לא היה שם שום שם.`,
      illustrationPrompt: "A hallway, the hero kneeling by the front door holding a blue envelope and a hand-drawn map",
    },
    {
      text: `${name} ${g("אהב", "אהבה")} תעלומות כמעט כמו ש${g("הוא אהב", "היא אהבה")} ${hobby}. ${g("הוא שם", "היא שמה")} בתיק פנס, מחברת ועיפרון מחודד, ${g("ויצא", "ויצאה")} לחצר.`,
      illustrationPrompt: "The hero in a backyard with a backpack, holding a torch and a notebook, studying the map",
    },
    {
      text: `המפה הובילה אל עץ התות הגדול. ״שלושה צעדים ימינה מהעץ,״ ${g("קרא", "קראה")} ${name} בקול. אחד, שניים, שלושה. אבל שם היה רק עציץ ריק.`,
      illustrationPrompt: "The hero counting steps next to a big mulberry tree, an empty flowerpot on the ground",
    },
    {
      text: `${name} ${g("הרים", "הרימה")} את העציץ. מתחתיו חיכה פתק: ״כמעט! חפשו במקום שבו המים שרים.״ מים ששרים? ${name} ${g("קימט", "קימטה")} את המצח.`,
      illustrationPrompt: "The hero lifting the flowerpot and finding a small folded note underneath",
    },
    {
      text: `${g("הוא חשב", "היא חשבה")} על הברז בגינה, אבל הוא רק טפטף. ${g("הוא חשב", "היא חשבה")} על הצינור, אבל הוא שתק. ואז נשמע מהפינה צליל עדין: טיף, טף, טיף.`,
      illustrationPrompt: "The hero listening carefully in the garden, a dripping tap and a coiled hose nearby",
    },
    {
      text: `זו הייתה המזרקה הקטנה של השכנה רותי! ${name} ${g("רץ", "רצה")} אליה, ${g("ומצא", "ומצאה")} שם קופסת פח קשורה בסרט צהוב.`,
      illustrationPrompt: "A small stone fountain by a garden fence, a tin box tied with a yellow ribbon beside it",
    },
    {
      text: `הסרט היה קשור חזק מאוד. ${name} ${g("ניסה", "ניסתה")} למשוך, וזה לא עזר. ${g("הוא נשם", "היא נשמה")} עמוק, ${g("הסתכל", "הסתכלה")} מקרוב, ${g("ופתח", "ופתחה")} את הקשר לאט, לולאה אחרי לולאה.`,
      illustrationPrompt: "Close view of the hero patiently untying a tight yellow ribbon on a tin box",
    },
    {
      text: `בקופסה היו זרעים, כף גינה קטנה ופתק אחרון: ״למי שלא מוותר מגיעה גינה משלו. באהבה, רותי.״`,
      illustrationPrompt: "The open tin box showing seed packets, a small garden trowel and a note",
    },
    {
      text: `רותי הציצה מעל הגדר וחייכה. ״ידעתי שתפתרו את זה,״ אמרה. יחד הם חפרו ערוגה קטנה וטמנו בה את הזרעים, אחד אחד.`,
      illustrationPrompt: "The hero and a kind elderly neighbour planting seeds together in a small garden bed",
    },
    {
      text: `בכל בוקר ${g("השקה", "השקתה")} ${name} את הערוגה. ואחרי שבוע הציץ מהאדמה עלה ירוק ראשון. ${name} ${g("צייר", "ציירה")} אותו במחברת ${g("וכתב", "וכתבה")} מתחתיו: ״התעלומה הבאה, אני מחכה לך.״`,
      illustrationPrompt: "Morning, the hero watering a garden bed where a first green sprout has appeared, notebook on the ground",
    },
  ];
}

export function mockPages(input: WizardInput): StoryPage[] {
  const f = forms(input);
  const pages =
    input.ageGroup === "0-2" ? toddlerPages(f) : input.ageGroup === "3-5" ? preschoolPages(f) : readerPages(f);
  return pages.slice(0, AGE_WRITING_RULES[input.ageGroup].pageCount);
}

export function mockOutline(input: WizardInput): Outline {
  const pages = mockPages(input);
  return {
    premise: `${input.childName} יוצא${input.childGender === "girl" ? "ת" : ""} להרפתקה קטנה ליד הבית (מתווה לדוגמה).`,
    problem: "הדרך לא פשוטה כמו שנראה בהתחלה.",
    resolution: "בסבלנות ובצעדים קטנים מגיעים.",
    refrain: input.ageGroup === "6-8" ? "" : "צעד אחד, ועוד צעד",
    beats: pages.map((page) => page.illustrationPrompt),
  };
}

export function mockReview(): Review {
  return { verdict: "ok", issues: [] };
}

export function mockCharacter(input: WizardInput): CharacterSheet {
  const who = input.childGender === "girl" ? "girl" : "boy";
  const age = input.childAge !== undefined ? `about ${input.childAge} years old` : "a young child";
  return {
    description:
      `A cheerful illustrated ${who}, ${age}, with short brown hair, a yellow t-shirt, blue shorts, ` +
      "red sneakers and a small green backpack. (Sample character sheet: the demo text service does not read the appearance description.)",
  };
}

export function mockMetadata(input: WizardInput): StoryMetadata {
  return {
    title: `ההרפתקה של ${input.childName} ${MOCK_TITLE_SUFFIX}`,
    summary:
      `סיפור לדוגמה שנוצר בלי שירות כתיבה מחובר: תבנית קבועה שבה שולב השם ${input.childName}. ` +
      "הרעיון שהקלדתם לא שולב בסיפור. כשיחובר שירות הכתיבה, הסיפור ייכתב במיוחד לפי הרעיון.",
    tags: Array.from(new Set(["הרפתקה", "סיפור לדוגמה", ...input.hobbies])).slice(0, 5),
    themes: input.ageGroup === "0-2" ? ["curiosity"] : ["perseverance", "curiosity"],
    categories: [input.category],
    discussionQuestions:
      input.ageGroup === "0-2"
        ? ["איזו חיה ראינו בסיפור?", "איך עושה הכלב?"]
        : ["מה עזר לגיבור הסיפור להמשיך כשהיה קשה?", "לאיזו הרפתקה היית רוצה לצאת?"],
  };
}
