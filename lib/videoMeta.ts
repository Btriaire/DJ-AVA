export type VideoMeta = {
  artist?: string;
  album?: string;
  track?: string;
  channel?: string;
  uploadDate?: string;
  categories?: string[];
  tags?: string[];
  label?: string;
  format?: string;
  country?: string;
  released?: string;
  genre?: string;
  style?: string;
  tracklist?: string[];
};

export function parseDescriptionFields(description: string): Pick<VideoMeta, "label" | "format" | "country" | "released" | "genre" | "style"> {
  const result: Record<string, string> = {};
  const lines = description.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^([^:]+):\s*(.+)$/i);
    if (!match) continue;

    const key = match[1].trim().toLowerCase();
    const value = match[2].trim().substring(0, 200);

    if (!value) continue;

    switch (key) {
      case 'label':
        if (!result.label) result.label = value;
        break;
      case 'format':
        if (!result.format) result.format = value;
        break;
      case 'country':
      case 'pays':
        if (!result.country) result.country = value;
        break;
      case 'released':
      case 'released on':
      case 'année':
      case 'year':
        if (!result.released) result.released = value;
        break;
      case 'genre':
        if (!result.genre) result.genre = value;
        break;
      case 'style':
        if (!result.style) result.style = value;
        break;
    }
  }

  return result as Pick<VideoMeta, "label" | "format" | "country" | "released" | "genre" | "style">;
}

export function parseTracklist(description: string): string[] {
  const lines = description.split('\n');
  let inTracklist = false;
  const tracklist: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inTracklist) {
      if (/^(musique|tracklist|track list)$/i.test(trimmed)) {
        inTracklist = true;
      }
      continue;
    }

    if (!trimmed) {
      if (tracklist.length > 0) break;
      continue;
    }

    if (/^\d+\s*(titre|track)s?$/i.test(trimmed)) continue;

    tracklist.push(trimmed.substring(0, 120));
    if (tracklist.length >= 30) break;
  }

  return tracklist;
}

export function metaFromYtDlp(data: Record<string, unknown>): VideoMeta {
  const meta: VideoMeta = {};

  if (typeof data.artist === 'string') meta.artist = data.artist;
  if (typeof data.album === 'string') meta.album = data.album;
  if (typeof data.track === 'string') meta.track = data.track;
  if (typeof data.channel === 'string') meta.channel = data.channel;
  if (typeof data.uploader === 'string' && !meta.channel) meta.channel = data.uploader;

  if (typeof data.upload_date === 'string') {
    const dateMatch = data.upload_date.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (dateMatch) {
      meta.uploadDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    }
  }

  if (Array.isArray(data.categories)) {
    meta.categories = data.categories
      .filter((cat): cat is string => typeof cat === 'string')
      .slice(0, 8);
  }

  if (Array.isArray(data.tags)) {
    meta.tags = data.tags
      .filter((tag): tag is string => typeof tag === 'string')
      .slice(0, 8);
  }

  if (typeof data.description === 'string') {
    const description = data.description;
    const fields = parseDescriptionFields(description);
    const tracklist = parseTracklist(description);

    Object.assign(meta, fields);
    if (tracklist.length > 0) meta.tracklist = tracklist;
  }

  // Remove empty fields
  return Object.fromEntries(
    Object.entries(meta).filter(([_, value]) => value !== undefined && value !== null && value !== '')
  ) as VideoMeta;
}
