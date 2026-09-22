export type CatalogPhotoCandidate = {
  name?: string | null;
  widthPx?: number | null;
  heightPx?: number | null;
};

function cardPhotoScore(photo: CatalogPhotoCandidate, index: number) {
  const width = Number(photo.widthPx);
  const height = Number(photo.heightPx);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return -index * 0.01;
  }
  const ratio = width / height;
  const target = 4 / 3;
  const ratioPenalty = Math.abs(Math.log(ratio / target)) * 36;
  const extremePenalty = ratio < 0.72 || ratio > 2.35 ? 24 : 0;
  const megapixels = (width * height) / 1_000_000;
  const sizeBonus = Math.min(18, Math.log2(Math.max(1, megapixels + 1)) * 7);
  return 42 + sizeBonus - ratioPenalty - extremePenalty - index * 0.01;
}

export function rankCatalogPhotosForCard<T extends CatalogPhotoCandidate>(
  photos: T[] | undefined,
): T[] {
  return (photos ?? [])
    .filter((photo) => typeof photo?.name === "string" && photo.name.trim().length > 0)
    .map((photo, index) => ({ photo, index, score: cardPhotoScore(photo, index) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ photo }) => photo);
}
