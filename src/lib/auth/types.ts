import type { User } from "../types";

/** Thrown by requireUser() / requireRole(). status is 401 (not signed in) or 403 (role too low). */
export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message?: string,
  ) {
    super(message ?? (status === 401 ? "יש להתחבר כדי להמשיך" : "אין לך הרשאה לפעולה הזאת"));
    this.name = "AuthError";
  }
}

/** Backend behind getCurrentUser() / signOut(). Implemented by ./local.ts and ./supabase.ts. */
export interface AuthProvider {
  readonly kind: "local" | "supabase";
  /** The signed-in user for the current request, or null. Must not throw for anonymous visitors. */
  getCurrentUser(): Promise<User | null>;
  /** Ends the session of the current request (only callable from a Server Action or Route Handler). */
  signOut(): Promise<void>;
}
