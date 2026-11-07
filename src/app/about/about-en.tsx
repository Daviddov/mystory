/** The about page in English, for visitors who chose the English interface. */
import Link from "@/components/i18n/LocaleLink";
import { ButtonLink } from "@/components/ui";
import { routes } from "@/lib/routes";
import { InfoPage, InfoSection } from "./_components/InfoPage";

export function AboutPageEn() {
  return (
    <InfoPage
      title="About"
      current={routes.about()}
      lead="My Story is a place to read and listen to children's stories in Hebrew, and an easy place to make and upload books of your own."
    >
      <InfoSection id="reading-first" title="Reading comes first">
        <p>
          Open a book and read. No sign-up, no ads and no pop-ups. Every book is shown one page at a time, with a large
          picture and clear text, and Hebrew books turn from right to left like a real Hebrew book.
        </p>
        <p>
          The library is sorted by <Link href={routes.books()}>age, category, reading time and topic to talk about</Link>,
          so it is easy to find a five-minute bedtime story, or a story about courage before the first day of
          kindergarten.
        </p>
      </InfoSection>

      <InfoSection id="what-is-here" title="What you can do here">
        <ul>
          <li>
            <strong>Read.</strong> Books for ages 0 to 8, with larger text, full screen, and picking up where you
            stopped.
          </li>
          <li>
            <strong>Listen.</strong> In narrated books the word being read is highlighted. In{" "}
            <Link href={routes.listen()}>bedtime listening</Link> stories play one after another, with a sleep timer.
          </li>
          <li>
            <strong>Read with nikud.</strong> In books with nikud (Hebrew vowel marks), the nikud button shows or hides
            them with one tap.
          </li>
          <li>
            <strong>Create.</strong> In the <Link href={routes.studio()}>studio</Link> you upload pictures, type the text
            and record narration in your own voice. In{" "}
            <Link href={routes.create()}>Make a personal book</Link> you build a story where your child is the hero.
          </li>
          <li>
            <strong>Print.</strong> Every book can be printed or downloaded as a PDF, one story page per sheet.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="principles" title="Our principles">
        <ul>
          <li>
            <strong>A book is a book.</strong> A book uploaded by hand, an imported book and a book made with AI look and
            read the same way.
          </li>
          <li>
            <strong>AI is an extra.</strong> Reading, uploading and editing work without it. When something on the site
            is a demo and not a real result, such as a demo voice or a sample picture, it says so plainly.
          </li>
          <li>
            <strong>Private by default.</strong> A book you made belongs to you and stays private. It reaches the public
            library only after an editor of the site approves it.
          </li>
          <li>
            <strong>Keeping children safe.</strong> There are no child profiles and no ads. More in the{" "}
            <Link href={routes.privacy()}>privacy policy</Link>.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="content" title="Where the stories come from">
        <p>
          The first stories in the library are original stories written and illustrated especially for the site, with
          the help of AI. They are reserved to the site and allowed for personal use. Every book&apos;s page names its
          author, illustrator, license and source.
        </p>
        <p>
          Later we will add books under Creative Commons licenses translated into Hebrew, with full credit to their
          creators, and books that parents made and an editor approved.
        </p>
      </InfoSection>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href={routes.books()}>To the library</ButtonLink>
        <ButtonLink href={routes.faq()} variant="outline">
          Questions and answers
        </ButtonLink>
      </div>
    </InfoPage>
  );
}
