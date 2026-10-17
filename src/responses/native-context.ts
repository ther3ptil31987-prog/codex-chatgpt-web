/** Native instruction refreshes are context, not a new human task revision. */
export function isNativeAgentsMdContext(item: Record<string, unknown>): boolean {
  if (item.type !== "message" || item.role !== "user" || typeof item.id !== "string" || !item.id) return false;
  const metadata = item.internal_chat_message_metadata_passthrough as {
    turn_id?: unknown; content_item_kinds?: unknown;
  } | undefined;
  const kinds = metadata?.content_item_kinds;
  return typeof metadata?.turn_id === "string" && metadata.turn_id.trim().length > 0
    && Array.isArray(kinds) && kinds.length > 0 && kinds.every(kind => kind === "agents_md.instructions");
}
