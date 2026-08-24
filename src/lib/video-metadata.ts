export type ParsedVideoMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
};

type IsoBox = {
  type: string;
  start: number;
  dataStart: number;
  end: number;
};

const MAX_MOOV_BYTES = 32 * 1024 * 1024;
const MAX_TOP_LEVEL_BOXES = 2048;

function readType(view: DataView, offset: number) {
  if (offset < 0 || offset + 4 > view.byteLength) return "";
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function readUint64(view: DataView, offset: number) {
  const high = view.getUint32(offset);
  const low = view.getUint32(offset + 4);
  const value = high * 2 ** 32 + low;
  return Number.isSafeInteger(value) ? value : Number.NaN;
}

function readBoxHeader(view: DataView, offset: number, limit: number): IsoBox | null {
  if (offset < 0 || offset + 8 > limit || offset + 8 > view.byteLength) return null;
  const size32 = view.getUint32(offset);
  const type = readType(view, offset + 4);
  let headerBytes = 8;
  let size = size32;
  if (size32 === 1) {
    if (offset + 16 > limit || offset + 16 > view.byteLength) return null;
    size = readUint64(view, offset + 8);
    headerBytes = 16;
  } else if (size32 === 0) {
    size = limit - offset;
  }
  if (!Number.isSafeInteger(size) || size < headerBytes || offset + size > limit) return null;
  return {
    type,
    start: offset,
    dataStart: offset + headerBytes,
    end: offset + size,
  };
}

function childBoxes(view: DataView, start: number, end: number) {
  const boxes: IsoBox[] = [];
  let offset = start;
  while (offset + 8 <= end && boxes.length < MAX_TOP_LEVEL_BOXES) {
    const box = readBoxHeader(view, offset, end);
    if (!box) break;
    boxes.push(box);
    if (box.end <= offset) break;
    offset = box.end;
  }
  return boxes;
}

function findChild(view: DataView, parent: IsoBox, type: string) {
  return childBoxes(view, parent.dataStart, parent.end).find((box) => box.type === type) ?? null;
}

function readTimedBox(view: DataView, box: IsoBox) {
  const version = view.getUint8(box.dataStart);
  const timescaleOffset = box.dataStart + (version === 1 ? 20 : 12);
  const durationOffset = box.dataStart + (version === 1 ? 24 : 16);
  const durationBytes = version === 1 ? 8 : 4;
  if (durationOffset + durationBytes > box.end) return null;
  const timescale = view.getUint32(timescaleOffset);
  const duration =
    version === 1 ? readUint64(view, durationOffset) : view.getUint32(durationOffset);
  if (!timescale || !Number.isFinite(duration) || duration <= 0) return null;
  return duration / timescale;
}

function parseMovieMetadata(view: DataView): ParsedVideoMetadata | null {
  const root = readBoxHeader(view, 0, view.byteLength);
  if (!root || root.type !== "moov") return null;
  const movieHeader = findChild(view, root, "mvhd");
  let durationSeconds = movieHeader ? (readTimedBox(view, movieHeader) ?? 0) : 0;
  let width = 0;
  let height = 0;

  for (const track of childBoxes(view, root.dataStart, root.end).filter(
    (box) => box.type === "trak",
  )) {
    const media = findChild(view, track, "mdia");
    const handler = media ? findChild(view, media, "hdlr") : null;
    if (!handler || handler.dataStart + 12 > handler.end) continue;
    if (readType(view, handler.dataStart + 8) !== "vide") continue;

    const trackHeader = findChild(view, track, "tkhd");
    if (trackHeader && trackHeader.end - trackHeader.dataStart >= 8) {
      width = view.getUint32(trackHeader.end - 8) / 65_536;
      height = view.getUint32(trackHeader.end - 4) / 65_536;
    }

    const mediaHeader = media ? findChild(view, media, "mdhd") : null;
    if (!durationSeconds && mediaHeader) durationSeconds = readTimedBox(view, mediaHeader) ?? 0;
    if (width > 0 && height > 0) break;
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || width <= 0 || height <= 0) {
    return null;
  }
  return { durationSeconds, width, height };
}

async function readTopLevelHeader(file: Blob, offset: number) {
  const bytes = await file.slice(offset, Math.min(file.size, offset + 16)).arrayBuffer();
  const view = new DataView(bytes);
  if (view.byteLength < 8) return null;
  const size32 = view.getUint32(0);
  const type = readType(view, 4);
  const headerBytes = size32 === 1 ? 16 : 8;
  if (view.byteLength < headerBytes) return null;
  const size = size32 === 1 ? readUint64(view, 8) : size32 === 0 ? file.size - offset : size32;
  if (!Number.isSafeInteger(size) || size < headerBytes || offset + size > file.size) return null;
  return { type, size };
}

/**
 * Lit les métadonnées d'un MP4/MOV sans attendre le décodeur vidéo du navigateur.
 * Safari peut ne jamais fournir videoWidth/videoHeight pour certains fichiers iPhone,
 * alors que les mêmes informations sont déjà présentes dans la boîte ISO `moov`.
 */
export async function parseIsoBmffVideoMetadata(file: Blob): Promise<ParsedVideoMetadata> {
  let offset = 0;
  let boxCount = 0;
  while (offset + 8 <= file.size && boxCount < MAX_TOP_LEVEL_BOXES) {
    const header = await readTopLevelHeader(file, offset);
    if (!header) break;
    if (header.type === "moov") {
      if (header.size > MAX_MOOV_BYTES) {
        throw new Error("Les informations internes de cette vidéo sont trop volumineuses.");
      }
      const buffer = await file.slice(offset, offset + header.size).arrayBuffer();
      const parsed = parseMovieMetadata(new DataView(buffer));
      if (!parsed) throw new Error("Les informations internes de cette vidéo sont incomplètes.");
      return parsed;
    }
    offset += header.size;
    boxCount += 1;
  }
  throw new Error("Cette vidéo ne contient pas d’informations MP4/MOV lisibles.");
}
