// ======================================================================
// DUPLICATE TRACK SCANNER
// ======================================================================

/**
 * Scans a list of tracks for duplicates based on various criteria
 * @param tracks - Array of track objects with trackId, title, duration, and optionally guid
 * @param options - Scanning options
 * @returns Object containing duplicate groups and summary
 */

export interface DuplicateTrack {
  trackId: string;
  title: string;
  duration: number;
  guid?: string | null;
  artist?: string;
  album?: string;
  playlistItemId?: string | number;
}

export interface DuplicateGroup {
  key: string;
  matchType: 'guid' | 'name_duration' | 'name_only';
  tracks: DuplicateTrack[];
  isExactMatch: boolean;
}

export interface ScanOptions {
  /** Match by GUID (most accurate) */
  matchByGuid?: boolean;
  /** Match by track name and duration */
  matchByNameAndDuration?: boolean;
  /** Match by track name only (least accurate) */
  matchByNameOnly?: boolean;
  /** Duration tolerance in milliseconds for name+duration matching */
  durationTolerance?: number;
  /** Ignore case when matching names */
  ignoreCase?: boolean;
}

export interface ScanResult {
  duplicateGroups: DuplicateGroup[];
  totalDuplicates: number;
  totalTracks: number;
  uniqueTracks: number;
}

const DEFAULT_OPTIONS: Required<ScanOptions> = {
  matchByGuid: true,
  matchByNameAndDuration: true,
  matchByNameOnly: false,
  durationTolerance: 1000, // 1 second tolerance
  ignoreCase: true,
};

/**
 * Normalizes a track name for comparison
 */
const normalizeName = (name: string, ignoreCase: boolean): string => {
  let normalized = name.trim();
  if (ignoreCase) {
    normalized = normalized.toLowerCase();
  }
  // Remove common variations
  normalized = normalized
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/gi, '')
    .trim();
  return normalized;
};

/**
 * Creates a unique key for GUID-based matching
 */
const createGuidKey = (track: DuplicateTrack): string | null => {
  if (!track.guid) return null;
  return `guid:${track.guid}`;
};

/**
 * Creates a unique key for name+duration matching
 */
const createNameDurationKey = (
  track: DuplicateTrack,
  tolerance: number,
  ignoreCase: boolean
): string => {
  const normalizedName = normalizeName(track.title, ignoreCase);
  // Round duration to nearest tolerance interval
  const roundedDuration = Math.round(track.duration / tolerance) * tolerance;
  return `name_duration:${normalizedName}:${roundedDuration}`;
};

/**
 * Creates a unique key for name-only matching
 */
const createNameOnlyKey = (track: DuplicateTrack, ignoreCase: boolean): string => {
  const normalizedName = normalizeName(track.title, ignoreCase);
  return `name_only:${normalizedName}`;
};

/**
 * Scans tracks for duplicates
 */
export const scanForDuplicates = (
  tracks: DuplicateTrack[],
  options: ScanOptions = {}
): ScanResult => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const duplicateGroupsMap = new Map<string, DuplicateGroup>();
  const processedTrackIds = new Set<string>();

  // First pass: Group by GUID (highest priority)
  if (opts.matchByGuid) {
    tracks.forEach((track) => {
      const key = createGuidKey(track);
      if (!key) return;

      if (!duplicateGroupsMap.has(key)) {
        duplicateGroupsMap.set(key, {
          key,
          matchType: 'guid',
          tracks: [],
          isExactMatch: true,
        });
      }
      const group = duplicateGroupsMap.get(key)!;
      if (!group.tracks.find((t) => t.trackId === track.trackId)) {
        group.tracks.push(track);
        processedTrackIds.add(track.trackId);
      }
    });
  }

  // Second pass: Group by name + duration
  if (opts.matchByNameAndDuration) {
    tracks.forEach((track) => {
      if (processedTrackIds.has(track.trackId)) return;

      const key = createNameDurationKey(track, opts.durationTolerance, opts.ignoreCase);
      if (!duplicateGroupsMap.has(key)) {
        duplicateGroupsMap.set(key, {
          key,
          matchType: 'name_duration',
          tracks: [],
          isExactMatch: false,
        });
      }
      const group = duplicateGroupsMap.get(key)!;
      if (!group.tracks.find((t) => t.trackId === track.trackId)) {
        group.tracks.push(track);
        processedTrackIds.add(track.trackId);
      }
    });
  }

  // Third pass: Group by name only (if enabled)
  if (opts.matchByNameOnly) {
    tracks.forEach((track) => {
      if (processedTrackIds.has(track.trackId)) return;

      const key = createNameOnlyKey(track, opts.ignoreCase);
      if (!duplicateGroupsMap.has(key)) {
        duplicateGroupsMap.set(key, {
          key,
          matchType: 'name_only',
          tracks: [],
          isExactMatch: false,
        });
      }
      const group = duplicateGroupsMap.get(key)!;
      if (!group.tracks.find((t) => t.trackId === track.trackId)) {
        group.tracks.push(track);
        processedTrackIds.add(track.trackId);
      }
    });
  }

  // Filter to only groups with actual duplicates (2+ tracks)
  const duplicateGroups = Array.from(duplicateGroupsMap.values()).filter(
    (group) => group.tracks.length >= 2
  );

  // Sort groups by match type (guid first, then name_duration, then name_only)
  const matchTypeOrder = { guid: 0, name_duration: 1, name_only: 2 };
  duplicateGroups.sort((a, b) => {
    const typeDiff = matchTypeOrder[a.matchType] - matchTypeOrder[b.matchType];
    if (typeDiff !== 0) return typeDiff;
    // Then sort by number of duplicates (descending)
    return b.tracks.length - a.tracks.length;
  });

  const totalDuplicates = duplicateGroups.reduce(
    (sum, group) => sum + group.tracks.length,
    0
  );

  return {
    duplicateGroups,
    totalDuplicates,
    totalTracks: tracks.length,
    uniqueTracks: tracks.length - totalDuplicates + duplicateGroups.length,
  };
};

/**
 * Scans a specific playlist for duplicates
 */
export const scanPlaylistForDuplicates = (
  playlistTracks: DuplicateTrack[],
  options: ScanOptions = {}
): ScanResult => {
  return scanForDuplicates(playlistTracks, options);
};

/**
 * Gets duplicate track IDs from scan results
 */
export const getDuplicateTrackIds = (scanResult: ScanResult): Set<string> => {
  const duplicateIds = new Set<string>();
  scanResult.duplicateGroups.forEach((group) => {
    // Mark all but the first track in each group as duplicate
    group.tracks.slice(1).forEach((track) => {
      duplicateIds.add(track.trackId);
    });
  });
  return duplicateIds;
};

export default {
  scanForDuplicates,
  scanPlaylistForDuplicates,
  getDuplicateTrackIds,
};
