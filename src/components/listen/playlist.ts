/** Client helper for the user's listening playlist (POST / DELETE /api/playlist/<bookId>). */
export async function setInPlaylist(bookId: string, on: boolean): Promise<boolean> {
  try {
    const response = await fetch(`/api/playlist/${encodeURIComponent(bookId)}`, {
      method: on ? "POST" : "DELETE",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    return response.ok;
  } catch {
    return false;
  }
}
