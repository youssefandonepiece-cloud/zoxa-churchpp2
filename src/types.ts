export interface ZoxaData {
  version: number;
  songs: Song[];
  bible?: Bible;
}

export interface Song {
  id: number;
  title: string;
  language: string;
  dialect: string | null;
  notes: string | null;
  sections: Section[];
}

export interface Section {
  id: number;
  type: SectionType;
  position: number;
  slides: Slide[];
}

export enum SectionType {
  VERSE = 0,
  CHORUS = 1,
  BRIDGE = 4,
}

export interface Slide {
  id: number;
  position: number;
  heading: string | null;
  segments: Segment[];
}

export interface Segment {
  id: number;
  slide_id: number;
  position: number;
  content: string;
}

export interface Bible {
  version: string;
  translation: string;
  language: string;
  books: BibleBook[];
}

export interface BibleBook {
  id: number;
  name: string;
  nameAr: string;
  nameEn: string;
  testament: "OT" | "NT";
  abbreviation: string;
  chapters: BibleChapter[];
}

export interface BibleChapter {
  number: number;
  verses: BibleVerse[];
}

export interface BibleVerse {
  number: number;
  text: string;
}

export interface SongSearchResult {
  type: "song";
  song: Song;
  score?: number;
  matchedField?: "title" | "lyrics";
  matchedText?: string;
}

export interface VerseSearchResult {
  type: "verse";
  book: BibleBook;
  chapter: number;
  verse: BibleVerse;
  score?: number;
  matchedText?: string;
}

export interface ChapterSearchResult {
  type: "chapter";
  book: BibleBook;
  chapter: number;
  verses: BibleVerse[];
}

export type SearchResult =
  | SongSearchResult
  | VerseSearchResult
  | ChapterSearchResult;

export interface SearchOptions {
  limit?: number;
}
