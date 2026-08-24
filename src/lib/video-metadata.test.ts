import { describe, expect, it } from "vitest";
import { parseIsoBmffVideoMetadata } from "./video-metadata";

function concat(...parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function box(type: string, payload = new Uint8Array()) {
  const output = new Uint8Array(8 + payload.length);
  const view = new DataView(output.buffer);
  view.setUint32(0, output.length);
  for (let index = 0; index < 4; index += 1) output[4 + index] = type.charCodeAt(index);
  output.set(payload, 8);
  return output;
}

function movieHeader(timescale: number, duration: number) {
  const payload = new Uint8Array(100);
  const view = new DataView(payload.buffer);
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return box("mvhd", payload);
}

function mediaHeader(timescale: number, duration: number) {
  const payload = new Uint8Array(24);
  const view = new DataView(payload.buffer);
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return box("mdhd", payload);
}

function handler(type: "vide" | "soun") {
  const payload = new Uint8Array(20);
  for (let index = 0; index < 4; index += 1) payload[8 + index] = type.charCodeAt(index);
  return box("hdlr", payload);
}

function trackHeader(width: number, height: number) {
  const payload = new Uint8Array(84);
  const view = new DataView(payload.buffer);
  view.setUint32(payload.length - 8, width * 65_536);
  view.setUint32(payload.length - 4, height * 65_536);
  return box("tkhd", payload);
}

function makeMov(durationSeconds: number, width: number, height: number) {
  const timescale = 1_000;
  const media = box(
    "mdia",
    concat(mediaHeader(timescale, durationSeconds * timescale), handler("vide")),
  );
  const track = box("trak", concat(trackHeader(width, height), media));
  const movie = box("moov", concat(movieHeader(timescale, durationSeconds * timescale), track));
  const ftyp = box("ftyp", new TextEncoder().encode("qt  \u0000\u0000\u0000\u0000qt  "));
  const mediaData = box("mdat", new Uint8Array(32));
  return new Blob([ftyp, mediaData, movie], { type: "video/quicktime" });
}

describe("parseIsoBmffVideoMetadata", () => {
  it("lit un MOV de type iPhone même lorsque moov est placé après les données", async () => {
    const metadata = await parseIsoBmffVideoMetadata(makeMov(37, 1_920, 1_080));
    expect(metadata).toEqual({ durationSeconds: 37, width: 1_920, height: 1_080 });
  });

  it("refuse un conteneur sans boîte moov", async () => {
    const invalid = new Blob([box("ftyp", new TextEncoder().encode("isom"))], {
      type: "video/mp4",
    });
    await expect(parseIsoBmffVideoMetadata(invalid)).rejects.toThrow(/informations/i);
  });
});
