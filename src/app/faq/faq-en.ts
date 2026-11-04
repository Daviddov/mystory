/** The FAQ in English, for visitors who chose the English interface. Same topics and order as the Hebrew one. */
import { routes } from "@/lib/routes";
import type { Topic } from "./page";

export const TOPICS_EN: Topic[] = [
  {
    id: "reading",
    title: "Reading",
    emoji: "📖",
    questions: [
      {
        q: "Do I need to sign up to read?",
        a: ["No. Every book in the library is open to read without signing up, without paying and without ads."],
        link: { href: routes.books(), label: "All books" },
      },
      {
        q: "How do I turn the pages?",
        a: [
          "A book opens one page at a time. Swipe on the screen, use the large buttons on the sides, or press the arrow keys.",
          "Most books are in Hebrew, so pages turn from right to left, like a Hebrew book: the next page is on the left.",
        ],
      },
      {
        q: "How do I pick a book for my child's age?",
        a: [
          "Books are divided into three age groups: 0 to 2, 3 to 5 and 6 to 8. You can also filter by category, by reading time and by a topic to talk about, such as courage or friendship.",
        ],
      },
      {
        q: "Can we continue where we stopped?",
        a: [
          "Yes. The last page of every book is saved on your device, even without an account. Signed-in users also see the books they started on their personal shelf.",
        ],
      },
      {
        q: "Can I print a book?",
        a: [
          "Yes. On a book's print page you can print straight from the browser or download a PDF. Each landscape A4 sheet holds one story page: the picture on one side and the text on the other.",
        ],
      },
    ],
  },
  {
    id: "listening",
    title: "Listening",
    emoji: "🎧",
    questions: [
      {
        q: "Do all books have narration?",
        a: [
          "No. Only books that were recorded or had narration made for them. Such a book has a play button in the reader, and the word being read is highlighted.",
        ],
      },
      {
        q: "What is bedtime listening?",
        a: [
          "A playlist of all the narrated books in the library, played one after another. Choose an age, press play and you can turn off the screen.",
          "The sleep timer stops playback by itself after the time you chose, or at the end of the current story.",
        ],
        link: { href: routes.listen(), label: "Bedtime listening" },
      },
      {
        q: "What does \"demo voice\" mean?",
        a: [
          "When the narration service is not connected, the recording made is silent and the words are highlighted at a steady pace. It shows how narration works, it is not real narration, and the site says so clearly.",
        ],
      },
      {
        q: "Can I record the story in my own voice?",
        a: [
          "Yes. In the studio you can record every page right in the browser, in the voice of a parent or grandparent. The recording is saved as part of your book.",
        ],
      },
    ],
  },
  {
    id: "nikud",
    title: "The nikud button",
    emoji: "אָ",
    questions: [
      {
        q: "What does the nikud button do?",
        a: [
          "Nikud are the vowel marks of Hebrew. The button switches between the plain text and the same text with nikud. Nikud helps beginning readers, and you can turn it off for readers who no longer need it.",
        ],
      },
      {
        q: "Why do some books have no nikud button?",
        a: [
          "The button appears only in books that have a version with nikud. For now these are mostly the books for ages 0 to 2; more books will get nikud later.",
        ],
      },
      {
        q: "Is the nikud always right?",
        a: [
          "Not always. Automatic nikud can be wrong, especially for words that are spelled the same and read differently. In the studio you can correct the nikud of any word by hand.",
        ],
      },
    ],
  },
  {
    id: "creating",
    title: "Making a story",
    emoji: "✨",
    questions: [
      {
        q: "How do we make our own book?",
        a: [
          "There are two ways. In the studio you upload pictures or a PDF, type the text of every page and add narration. In \"Make a personal book\" you answer a few questions about the child and the story idea, and the site writes and illustrates a book.",
          "Either way the book opens in the editor, where you can change every word and every page.",
        ],
        link: { href: routes.create(), label: "Make a personal book" },
      },
      {
        q: "Do I need an account to make a book?",
        a: ["Yes. Reading and listening are open to everyone, but making, uploading and saving books requires signing in."],
      },
      {
        q: "How many books can I make with AI?",
        a: [
          "By default, one book a week per account. The limit exists because making illustrations costs money. Uploading and editing by hand in the studio are not limited.",
        ],
      },
      {
        q: "Who can see the book I made?",
        a: [
          "Only you. A new book is private. You can share it with family through a share link, and you can ask to publish it in the library. A book is published in the library only after an editor of the site has read and approved it.",
        ],
      },
      {
        q: "What do \"sample illustration\" and \"demo mode\" mean?",
        a: [
          "When the AI services are not connected, the wizard shows a fixed story and placeholder pictures to show how the process looks. They are not real results, and the site marks them clearly.",
        ],
      },
    ],
  },
  {
    id: "child-photos",
    title: "Privacy and children's photos",
    emoji: "🔒",
    questions: [
      {
        q: "Must I upload a photo of my child to make a personal book?",
        a: ["No. The photo is optional. You can describe the child in words, for example hair color, glasses or a favorite outfit."],
      },
      {
        q: "What happens to the photo I uploaded?",
        a: [
          "The photo is used only to write a description of an illustrated character who looks like the child. As soon as the description is made, the photo is deleted. It is not kept in the book, not shown on the site and not used for anything else.",
          "To make the description, the photo is sent to an outside AI service. The full details are in the privacy policy.",
        ],
        link: { href: routes.privacy(), label: "Privacy policy" },
      },
      {
        q: "Does the site keep information about children?",
        a: [
          "There are no child profiles and no sign-up for children. The account belongs to the parent. The name and hobbies typed into the wizard are used to write the story, so they appear in the book that is made.",
        ],
      },
      {
        q: "Are there ads or tracking?",
        a: ["There are no ads and no advertising tracking. The site counts how many times each book is opened, without knowing who opened it."],
      },
    ],
  },
  {
    id: "licensing",
    title: "Licenses and copyright",
    emoji: "📜",
    questions: [
      {
        q: "May I print and share the books?",
        a: [
          "It depends on each book's license, which appears on the book's page and on the last page of the print file. The site's original stories are reserved to the site and allowed for personal use: reading, reading aloud and printing a copy for the family. They may not be distributed, sold or adapted without permission.",
        ],
      },
      {
        q: "Who wrote and illustrated the original stories?",
        a: [
          "The first stories in the library were written and illustrated especially for the site by Dov Bar. This is stated in the source field of every such book.",
        ],
      },
      {
        q: "What may I upload to the studio?",
        a: [
          "Only content you own the rights to, or content whose license allows it, for example a book under a Creative Commons license. Every book must have a license and a source.",
          "Do not upload a scan of a book sold in stores, even if you bought it.",
        ],
      },
      {
        q: "Who owns the book I made?",
        a: [
          "You do. The text and pictures you uploaded stay yours. If you ask to publish the book in the library, you choose its license.",
        ],
        link: { href: routes.terms(), label: "Terms of use" },
      },
    ],
  },
];
