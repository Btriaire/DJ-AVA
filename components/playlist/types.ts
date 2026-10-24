import type { StemInfo } from "../prep/parts";

export type Side = "A" | "B";

// same colours as the Console decks (blue A, amber B)
export const DECK_COLOR: Record<Side, string> = { A: "#38bdf8", B: "#f59e0b" };

// the tracks dragged from the library (or from the tray in Préparation) carry their ids under this type
export const DRAG_TYPE = "application/x-djsynth-tracks";

export type { StemInfo };

// what the Playlist view needs to know about a deck that does not change while it plays
export interface DeckInfo {
  side: Side;
  title: string | null; // null = nothing loaded
  art?: string;
  bpm?: number;
  camelot?: string;
  live: boolean; // LIVE loop on for this deck
  trackNo?: number; // 1-based position in the set that drives this deck
  trackCount?: number;
  setName?: string; // the set that drives this deck, if any
  next: { title: string; art?: string } | null; // the track queued after the current one
}

// what changes every moment: polled by the deck strip, independent of React renders
export interface DeckLive {
  title: string | null;
  playing: boolean;
  pos: number; // seconds
  dur: number; // seconds
}

// where a track of a set sits relative to the decks
export interface TrackMark {
  cur: Side | null; // on air / loaded on this deck
  next: Side | null; // cued next on this deck
}

export type SendDest = "A" | "B" | "relay";
