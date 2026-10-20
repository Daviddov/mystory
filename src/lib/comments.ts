/** Readers' comments on books: who may delete them, and what a reader receives about one. Server only. */
import "server-only";
import { hasRole } from "./auth";
import type { Comment, User } from "./types";

/** What a reader receives about a comment: no user id, no e-mail. Plain text only. */
export interface CommentView {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  /** True for the author and for editors / admins. */
  canDelete: boolean;
}

/** May `user` delete `comment`? Its author, and editors and admins. */
export function canDeleteComment(comment: Pick<Comment, "userId">, user: User | null): boolean {
  return !!user && (user.id === comment.userId || hasRole(user, "editor"));
}

/** The name shown next to a comment. A name that is an e-mail address keeps only the part before the "@". */
export function authorDisplayName(user: Pick<User, "name">): string {
  const name = user.name.trim();
  const local = name.includes("@") ? name.split("@")[0].trim() : name;
  return (local || "קורא").slice(0, 100);
}

export function toCommentView(comment: Comment, user: User | null): CommentView {
  return {
    id: comment.id,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
    canDelete: canDeleteComment(comment, user),
  };
}
