// One-off: rewrites the text of a book that is itself in Arabic (the wizard book) in spoken Palestinian Arabic.
// Keeps the pictures; drops stale narration. Local data only.
//   npx tsx scripts/_set-spoken-arabic.ts
import { LocalRepository } from "../src/lib/repo/local";
import { dataDir } from "../src/lib/config";

const SLUG = "book-cmw4mtj1wi1b";
const TITLE = "هرشله والباب المسكّر";
const SUMMARY =
  "هرشله بدّه يفرّح صاحبه الزعلان اللي مسكّر الباب على حاله. بيجرّب كل شي: بيدقّ، بيغنّي، وبالآخر بيدخل من فتحة البريد وبيطلع وجهه أسود، وهون الضحكة بتفتح الباب.";
const QUESTIONS = [
  "شو بتعمل لما بتشوف صاحبك زعلان وبدّك تفرّحه؟",
  "أي موقف من القصة ضحّكك أكتر؟",
];
const PAGES = [
  "الباب مسكّر، والبيت ساكت ومظلم،\nوصاحب هرشله جوّا زعلان وما بتكلّم.\nوقف هرشله محتار، حكّ راسه وفكّر:\nكيف بفتح هالباب الكبير المسكّر؟",
  "دقّ هرشله بإيده الصغيرة، وقال بصوت حلو وخفيف:\n\"طقّ طقّ بوم، مين عالباب اليوم؟ افتحلي الباب، وبطير الهمّ!\"\nبس الباب ما تحرّك، وصاحبه جوّا ما ضحك.",
  "جاب هرشله جرس بيرنّ، ودمية مضحكة بتغنّي،\nوصرخ بأعلى صوته: \"طقّ طقّ بوم، مين عالباب اليوم؟ افتحلي الباب، وبطير الهمّ!\"\nوالقفل لسّا مش راضي يدور، وصاحبه جوّا لسّا مقهور.",
  "شاف هرشله تحت الباب فتحة صغيرة، وقال: \"عندي فكرة، فكرة كبيرة!\nمن فتحة البريد رح أدخل بسرعة، وبطلّ عليه فجأة وبعمل ضجّة!\"",
  "زحف هرشله عبطنه بالجنينة، ودسّ راسه بالفتحة بخفّة ورزانة،\nوهمس: \"زوووم... بيب... أنا هون جاي!\" وزغزغ الباب بريشة وقال: \"يلّا افتحلي!\"",
  "وقعت علبة دهان أسود كانت ورا الفتحة، وصار وجه هرشله كلّه نقاط وبقعة!\nصار وجهه أسود متل الفحم، ما ضلّ فيه غير عينين بتلمعوا،\nوكل واحد شافه كان رح يوقع من الضحك!",
  "التفت صاحبه الزعلان، وشاف وجه غريب بيضحّك الحيطان!\nمخلوق أسود صغير ولسانه زهري، انفجر يضحك: \"ها ها ها، هاد إنت يا هرشله؟\"\nوطار الحزن متل الفراشات!",
  "مسحوا وجوههم بميّ نضيفة، وفتحوا الباب سوا للشمس الخفيفة،\nوغنّوا بفرح: \"طقّ طقّ بوم، مين عالباب اليوم؟ فتحنا الباب وطار الهمّ!\"",
];

(async () => {
  const repo = new LocalRepository(dataDir());
  const book = await repo.getBookBySlug(SLUG);
  if (!book) throw new Error("no such book");
  if (book.pages.length !== PAGES.length) throw new Error(`${book.pages.length} pages, ${PAGES.length} texts`);
  await repo.replacePages(
    book.id,
    book.pages.map((page, i) => {
      const { audio: _a, wordTimings: _w, audioSource: _s, textNikud: _n, ...rest } = page;
      return { ...rest, text: PAGES[i] };
    }),
  );
  await repo.updateBook(book.id, { title: TITLE, summary: SUMMARY, discussionQuestions: QUESTIONS });
  console.log("ok:", TITLE);
})();
