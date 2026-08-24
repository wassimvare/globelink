import { describe, expect, it } from "vitest";
import {
  getStoryVideoUploadMode,
  STORY_DIRECT_VIDEO_MAX_BYTES,
  STORY_STORAGE_CHUNK_BYTES,
} from "./storage";

describe("story video upload strategy", () => {
  it("garde l'envoi direct pour les videos courtes et legeres", () => {
    expect(getStoryVideoUploadMode(STORY_DIRECT_VIDEO_MAX_BYTES)).toBe("direct");
  });

  it("bascule les videos lourdes en morceaux sans transcodage navigateur", () => {
    expect(getStoryVideoUploadMode(STORY_DIRECT_VIDEO_MAX_BYTES + 1)).toBe("chunked");
  });

  it("utilise des morceaux compatibles reseau mobile", () => {
    expect(STORY_STORAGE_CHUNK_BYTES).toBe(6 * 1024 * 1024);
  });
});
