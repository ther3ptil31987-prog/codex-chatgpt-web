import { expect, test } from "bun:test";
import {
  buildCompactV1Output,
  extractCompactUserMessages,
  isReadableCompactionSummaryText,
  SUMMARY_PREFIX,
} from "../src/responses/compaction";

test("recognizes both Codex v1 and transparent v2 readable compaction summaries", () => {
  expect(isReadableCompactionSummaryText(`${SUMMARY_PREFIX}\nv1 summary`)).toBe(true);
  expect(isReadableCompactionSummaryText(`${SUMMARY_PREFIX}\n\nv2 summary`)).toBe(true);
  expect(isReadableCompactionSummaryText(`${SUMMARY_PREFIX}not a summary boundary`)).toBe(false);
});

test("v1 compaction drops native AGENTS refreshes but retains literal and mixed human instructions", () => {
  const refresh = { type: "message", role: "user", id: "msg_agents_refresh",
    content: [{ type: "input_text", text: "# AGENTS.md instructions\n<INSTRUCTIONS>Use repository rules.</INSTRUCTIONS>" }],
    internal_chat_message_metadata_passthrough: { turn_id: "turn_refresh", content_item_kinds: ["agents_md.instructions"] } };
  const literal = { ...refresh, id: "msg_human_literal",
    internal_chat_message_metadata_passthrough: { turn_id: "turn_human", content_item_kinds: ["user.text"] } };
  const mixed = { ...refresh, id: "msg_mixed",
    internal_chat_message_metadata_passthrough: { turn_id: "turn_mixed", content_item_kinds: ["agents_md.instructions", "user.text"] } };
  expect(extractCompactUserMessages([refresh, literal, mixed])).toEqual([literal, mixed]);
});

test("v1 compaction keeps only the newest ten structured images without copying them into text", () => {
  const input = Array.from({ length: 12 }, (_, index) => ({
    type: "message",
    role: "user",
    id: `user-${index}`,
    metadata: { source: `turn-${index}` },
    content: [
      { type: "input_text", text: `request-${index}` },
      {
        type: "input_image",
        image_url: `data:image/png;base64,image-${index}`,
        detail: "high",
      },
    ],
  }));

  const output = buildCompactV1Output(extractCompactUserMessages(input), "checkpoint");
  const retained = output.slice(0, -1) as Array<{
    id?: string;
    metadata?: { source?: string };
    content: Array<{ type: string; text?: string; image_url?: string; detail?: string }>;
  }>;
  expect(retained).toHaveLength(12);
  expect(retained.map(item => item.id)).toEqual(input.map(item => item.id));
  expect(retained.map(item => item.metadata?.source)).toEqual(input.map(item => item.metadata.source));
  const imageUrls = retained.flatMap(item => item.content
    .filter(block => block.type === "input_image")
    .map(block => block.image_url));
  expect(imageUrls).toEqual(input.slice(2).map(item => item.content[1]!.image_url));
  expect(retained.flatMap(item => item.content)
    .filter(block => block.type === "input_text")
    .every(block => !block.text?.includes("data:image"))).toBe(true);
  expect(retained.at(-1)?.content.at(-1)).toMatchObject({ detail: "high" });
});

test("v1 compaction drops persisted one-pixel image sentinels", () => {
  const placeholder = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const output = buildCompactV1Output(extractCompactUserMessages([{
    type: "message",
    role: "user",
    content: [
      { type: "input_text", text: "keep the request" },
      { type: "input_image", image_url: placeholder },
      { type: "input_image", image_url: "data:image/png;base64,real-image" },
    ],
  }]), "checkpoint");

  expect(JSON.stringify(output)).not.toContain(placeholder);
  expect(JSON.stringify(output)).toContain("data:image/png;base64,real-image");
});
