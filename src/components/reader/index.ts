/**
 * The reading player. Embed it anywhere a book should be readable:
 *
 *   <BookPlayer book={toPlayerBook(book)} />                      full-screen reader
 *   <div className="h-[36rem]"><BookPlayer book={book} variant="embedded" /></div>
 */
export { BookPlayer } from "./BookPlayer";
export type { BookPlayerProps } from "./BookPlayer";
export { StoryText } from "./StoryText";
export type { StoryTextProps } from "./StoryText";
export { toPlayerBook } from "@/lib/reader/logic";
export type { PlayerBook, StoredProgress } from "@/lib/reader/logic";
