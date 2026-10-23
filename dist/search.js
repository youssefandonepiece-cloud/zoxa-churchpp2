import Fuse from "fuse.js";
const DEFAULT_LIMIT = 40;
const SONG_FUZZY_LIMIT = 12;
const VERSE_TEXT_LIMIT = 30;
const VERSE_SCAN_CHUNK = 2000;
export function normalizeArabic(input) {
    if (!input)
        return "";
    return input
        .normalize("NFKD")
        .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
        .replace(/\u0649/g, "\u064A")
        .replace(/\u0629/g, "\u0647")
        .replace(/\u0624/g, "\u0648")
        .replace(/\u0626/g, "\u064A")
        .replace(/\u0621/g, "")
        .replace(/[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}
function num(v, fallback = 0) {
    if (typeof v === "number" && !isNaN(v))
        return v;
    if (typeof v === "string") {
        const n = parseInt(v, 10);
        return isNaN(n) ? fallback : n;
    }
    return fallback;
}
function str(v, fallback = "") {
    if (typeof v === "string")
        return v;
    if (v == null)
        return fallback;
    return String(v);
}
export function yieldToMain() {
    return new Promise((resolve) => {
        if (typeof globalThis.requestIdleCallback === "function") {
            globalThis.requestIdleCallback(() => resolve(), { timeout: 50 });
        }
        else {
            setTimeout(resolve, 0);
        }
    });
}
const CANONICAL_BOOKS = [
    { id: 1, ar: "التكوين", en: "Genesis", abbr: "Gen", test: "OT" },
    { id: 2, ar: "الخروج", en: "Exodus", abbr: "Exo", test: "OT" },
    { id: 3, ar: "اللاويين", en: "Leviticus", abbr: "Lev", test: "OT" },
    { id: 4, ar: "العدد", en: "Numbers", abbr: "Num", test: "OT" },
    { id: 5, ar: "التثنية", en: "Deuteronomy", abbr: "Deut", test: "OT" },
    { id: 6, ar: "يشوع", en: "Joshua", abbr: "Josh", test: "OT" },
    { id: 7, ar: "القضاة", en: "Judges", abbr: "Judg", test: "OT" },
    { id: 8, ar: "راعوث", en: "Ruth", abbr: "Ruth", test: "OT" },
    { id: 9, ar: "صموئيل الأول", en: "1 Samuel", abbr: "1 Sam", test: "OT" },
    { id: 10, ar: "صموئيل الثاني", en: "2 Samuel", abbr: "2 Sam", test: "OT" },
    { id: 11, ar: "الملوك الأول", en: "1 Kings", abbr: "1 Kgs", test: "OT" },
    { id: 12, ar: "الملوك الثاني", en: "2 Kings", abbr: "2 Kgs", test: "OT" },
    { id: 13, ar: "أخبار الأيام الأول", en: "1 Chronicles", abbr: "1 Chr", test: "OT" },
    { id: 14, ar: "أخبار الأيام الثاني", en: "2 Chronicles", abbr: "2 Chr", test: "OT" },
    { id: 15, ar: "عزرا", en: "Ezra", abbr: "Ezra", test: "OT" },
    { id: 16, ar: "نحميا", en: "Nehemiah", abbr: "Neh", test: "OT" },
    { id: 17, ar: "أستير", en: "Esther", abbr: "Est", test: "OT" },
    { id: 18, ar: "أيوب", en: "Job", abbr: "Job", test: "OT" },
    { id: 19, ar: "المزامير", en: "Psalms", abbr: "Ps", test: "OT" },
    { id: 20, ar: "الأمثال", en: "Proverbs", abbr: "Prov", test: "OT" },
    { id: 21, ar: "الجامعة", en: "Ecclesiastes", abbr: "Eccl", test: "OT" },
    { id: 22, ar: "نشيد الأنشاد", en: "Song of Solomon", abbr: "Song", test: "OT" },
    { id: 23, ar: "إشعياء", en: "Isaiah", abbr: "Isa", test: "OT" },
    { id: 24, ar: "إرميا", en: "Jeremiah", abbr: "Jer", test: "OT" },
    { id: 25, ar: "مراثي إرميا", en: "Lamentations", abbr: "Lam", test: "OT" },
    { id: 26, ar: "حزقيال", en: "Ezekiel", abbr: "Ezek", test: "OT" },
    { id: 27, ar: "دانيال", en: "Daniel", abbr: "Dan", test: "OT" },
    { id: 28, ar: "هوشع", en: "Hosea", abbr: "Hos", test: "OT" },
    { id: 29, ar: "يوئيل", en: "Joel", abbr: "Joel", test: "OT" },
    { id: 30, ar: "عاموس", en: "Amos", abbr: "Amos", test: "OT" },
    { id: 31, ar: "عوبديا", en: "Obadiah", abbr: "Obad", test: "OT" },
    { id: 32, ar: "يونان", en: "Jonah", abbr: "Jonah", test: "OT" },
    { id: 33, ar: "ميخا", en: "Micah", abbr: "Mic", test: "OT" },
    { id: 34, ar: "ناحوم", en: "Nahum", abbr: "Nah", test: "OT" },
    { id: 35, ar: "حبقوق", en: "Habakkuk", abbr: "Hab", test: "OT" },
    { id: 36, ar: "صفنيا", en: "Zephaniah", abbr: "Zeph", test: "OT" },
    { id: 37, ar: "حجي", en: "Haggai", abbr: "Hag", test: "OT" },
    { id: 38, ar: "زكريا", en: "Zechariah", abbr: "Zech", test: "OT" },
    { id: 39, ar: "ملاخي", en: "Malachi", abbr: "Mal", test: "OT" },
    { id: 40, ar: "متى", en: "Matthew", abbr: "Matt", test: "NT" },
    { id: 41, ar: "مرقس", en: "Mark", abbr: "Mark", test: "NT" },
    { id: 42, ar: "لوقا", en: "Luke", abbr: "Luke", test: "NT" },
    { id: 43, ar: "يوحنا", en: "John", abbr: "John", test: "NT" },
    { id: 44, ar: "أعمال الرسل", en: "Acts", abbr: "Acts", test: "NT" },
    { id: 45, ar: "رومية", en: "Romans", abbr: "Rom", test: "NT" },
    { id: 46, ar: "كورنثوس الأولى", en: "1 Corinthians", abbr: "1 Cor", test: "NT" },
    { id: 47, ar: "كورنثوس الثانية", en: "2 Corinthians", abbr: "2 Cor", test: "NT" },
    { id: 48, ar: "غلاطية", en: "Galatians", abbr: "Gal", test: "NT" },
    { id: 49, ar: "أفسس", en: "Ephesians", abbr: "Eph", test: "NT" },
    { id: 50, ar: "فيلبي", en: "Philippians", abbr: "Phil", test: "NT" },
    { id: 51, ar: "كولوسي", en: "Colossians", abbr: "Col", test: "NT" },
    { id: 52, ar: "تسالونيكي الأولى", en: "1 Thessalonians", abbr: "1 Thess", test: "NT" },
    { id: 53, ar: "تسالونيكي الثانية", en: "2 Thessalonians", abbr: "2 Thess", test: "NT" },
    { id: 54, ar: "تيموثاوس الأولى", en: "1 Timothy", abbr: "1 Tim", test: "NT" },
    { id: 55, ar: "تيموثاوس الثانية", en: "2 Timothy", abbr: "2 Tim", test: "NT" },
    { id: 56, ar: "تيطس", en: "Titus", abbr: "Titus", test: "NT" },
    { id: 57, ar: "فليمون", en: "Philemon", abbr: "Phlm", test: "NT" },
    { id: 58, ar: "العبرانيين", en: "Hebrews", abbr: "Heb", test: "NT" },
    { id: 59, ar: "يعقوب", en: "James", abbr: "Jas", test: "NT" },
    { id: 60, ar: "بطرس الأولى", en: "1 Peter", abbr: "1 Pet", test: "NT" },
    { id: 61, ar: "بطرس الثانية", en: "2 Peter", abbr: "2 Pet", test: "NT" },
    { id: 62, ar: "يوحنا الأولى", en: "1 John", abbr: "1 John", test: "NT" },
    { id: 63, ar: "يوحنا الثانية", en: "2 John", abbr: "2 John", test: "NT" },
    { id: 64, ar: "يوحنا الثالثة", en: "3 John", abbr: "3 John", test: "NT" },
    { id: 65, ar: "يهوذا", en: "Jude", abbr: "Jude", test: "NT" },
    { id: 66, ar: "الرؤيا", en: "Revelation", abbr: "Rev", test: "NT" },
];
function normalizeBible(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const obj = raw;
    const rawBooks = Array.isArray(obj.books) ? obj.books : [];
    const rawChapters = Array.isArray(obj.chapters) ? obj.chapters : [];
    const rawVerses = Array.isArray(obj.verses) ? obj.verses : [];
    if (rawBooks.length === 0)
        return undefined;
    const books = [];
    const seenIds = new Set();
    for (let i = 0; i < rawBooks.length; i++) {
        const rb = rawBooks[i];
        const id = num(rb.id, i + 1);
        if (seenIds.has(id)) {
            console.warn(`⚠️ Duplicate book id ${id}, skipping`);
            continue;
        }
        seenIds.add(id);
        const canonical = CANONICAL_BOOKS[id - 1];
        const enName = str(rb.name, canonical?.en ?? `Book ${id}`);
        const arName = str(rb.nameAr, canonical?.ar ?? enName);
        const abbr = str(rb.abbreviation, canonical?.abbr ?? enName);
        let testament;
        if (rb.testament === "NT" || rb.testament === 1)
            testament = "NT";
        else if (rb.testament === "OT" || rb.testament === 0)
            testament = "OT";
        else
            testament = canonical?.test ?? "OT";
        books.push({
            id,
            name: arName,
            nameAr: arName,
            nameEn: enName,
            testament,
            abbreviation: abbr,
            chapters: [],
        });
    }
    const bookById = new Map();
    for (const b of books)
        bookById.set(b.id, b);
    const chapterById = new Map();
    for (const rc of rawChapters) {
        const cid = num(rc.id, -1);
        const bookId = num(rc.book_id, -1);
        const chapNum = num(rc.number, -1);
        if (cid < 0 || bookId < 0 || chapNum < 0)
            continue;
        chapterById.set(cid, { bookId, number: chapNum });
    }
    const bookBuckets = new Map();
    let skipped = 0;
    for (const rv of rawVerses) {
        const chapterId = num(rv.chapter_id, -1);
        if (chapterId < 0) {
            skipped++;
            continue;
        }
        const chap = chapterById.get(chapterId);
        if (!chap) {
            skipped++;
            continue;
        }
        const verseNum = num(rv.number, -1);
        const text = str(rv.text, "");
        if (verseNum < 0 || !text) {
            skipped++;
            continue;
        }
        let chapMap = bookBuckets.get(chap.bookId);
        if (!chapMap) {
            chapMap = new Map();
            bookBuckets.set(chap.bookId, chapMap);
        }
        let verses = chapMap.get(chap.number);
        if (!verses) {
            verses = [];
            chapMap.set(chap.number, verses);
        }
        verses.push({ number: verseNum, text });
    }
    if (skipped > 0) {
        console.warn(`⚠️ Skipped ${skipped} verses (bad chapter_id / number / text)`);
    }
    for (const [bookId, chapMap] of bookBuckets) {
        const book = bookById.get(bookId);
        if (!book)
            continue;
        book.chapters = Array.from(chapMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([chapterNumber, verses]) => {
            const sorted = verses.slice().sort((a, b) => a.number - b.number);
            return { number: chapterNumber, verses: sorted };
        });
    }
    const empty = books.filter((b) => b.chapters.length === 0);
    if (empty.length > 0) {
        console.warn(`⚠️ ${empty.length} book(s) have no chapters:`, empty.map((b) => `${b.id} (${b.nameAr})`).join(", "));
    }
    return {
        version: str(obj.version, "unknown"),
        translation: str(obj.translation, ""),
        language: str(obj.language, "ar"),
        books,
    };
}
function prepareSong(song) {
    const lyricsParts = [];
    const orderedSlides = [];
    const sections = song.sections.slice().sort((a, b) => a.position - b.position);
    for (const section of sections) {
        const slides = section.slides.slice().sort((a, b) => a.position - b.position);
        for (const slide of slides) {
            const orderedSegments = slide.segments
                .slice()
                .sort((a, b) => a.position - b.position);
            orderedSlides.push({ section, slide, orderedSegments });
            for (const seg of orderedSegments)
                lyricsParts.push(seg.content);
        }
    }
    const lyrics = lyricsParts.join("\n");
    return {
        song,
        title: song.title,
        titleLower: normalizeArabic(song.title),
        lyrics,
        lyricsLower: normalizeArabic(lyrics),
        orderedSlides,
    };
}
function prepareVerse(book, chapter, verse) {
    return {
        book,
        chapter,
        verse,
        textLower: normalizeArabic(verse.text),
        ref: `${book.nameAr} ${chapter}:${verse.number}`,
    };
}
async function buildPreparedData(data) {
    const songs = data.songs.map(prepareSong);
    const verses = [];
    const books = [];
    const bookById = new Map();
    const chapterIndex = new Map();
    const verseLookup = new Map();
    const bible = normalizeBible(data.bible);
    if (bible) {
        let bookCount = 0;
        for (const book of bible.books) {
            bookById.set(book.id, book);
            books.push({
                book,
                abbrLower: book.abbreviation.toLowerCase(),
                nameEnLower: book.nameEn.toLowerCase(),
                nameAr: book.nameAr,
                nameArNorm: normalizeArabic(book.nameAr),
            });
            if (!book.chapters || book.chapters.length === 0)
                continue;
            for (const chapter of book.chapters) {
                if (!chapter.verses || chapter.verses.length === 0)
                    continue;
                const chKey = `${book.id}:${chapter.number}`;
                const bucket = [];
                for (const verse of chapter.verses) {
                    const pv = prepareVerse(book, chapter.number, verse);
                    verses.push(pv);
                    bucket.push(pv);
                    verseLookup.set(`${chKey}:${verse.number}`, pv);
                }
                chapterIndex.set(chKey, bucket);
            }
            bookCount++;
            if (bookCount % 8 === 0)
                await yieldToMain();
        }
    }
    const FUZZY_OPTIONS = {
        includeScore: true,
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
            { name: "titleLower", weight: 2 },
            { name: "lyricsLower", weight: 1 },
        ],
    };
    const fuse = songs.length > 0 ? new Fuse(songs, FUZZY_OPTIONS) : null;
    return {
        songs,
        verses,
        books,
        bookById,
        chapterIndex,
        verseLookup,
        fuse,
        bible,
    };
}
function findBook(query, preparedBooks) {
    const q = query.trim();
    if (!q)
        return null;
    const qLower = q.toLowerCase();
    const qNorm = normalizeArabic(q);
    let exactAbbr = null;
    let exactAr = null;
    let exactEn = null;
    let arStart = null;
    let arStartCount = 0;
    let arContains = null;
    let arContainsCount = 0;
    let enStart = null;
    let enStartCount = 0;
    for (const pb of preparedBooks) {
        const b = pb.book;
        if (!exactAbbr && pb.abbrLower === qLower)
            exactAbbr = b;
        if (!exactAr && pb.nameAr === q)
            exactAr = b;
        if (!exactEn && pb.nameEnLower === qLower)
            exactEn = b;
        if (pb.nameArNorm.startsWith(qNorm)) {
            arStartCount++;
            if (arStartCount === 1)
                arStart = b;
        }
        if (pb.nameArNorm.includes(qNorm)) {
            arContainsCount++;
            if (arContainsCount === 1)
                arContains = b;
        }
        if (pb.nameEnLower.startsWith(qLower)) {
            enStartCount++;
            if (enStartCount === 1)
                enStart = b;
        }
    }
    return (exactAbbr ||
        exactAr ||
        exactEn ||
        (arStartCount === 1 ? arStart : null) ||
        (enStartCount === 1 ? enStart : null) ||
        (arContainsCount === 1 ? arContains : null));
}
function parseReference(query, preparedBooks) {
    const cleaned = query.trim().replace(/[،,]/g, " ").replace(/\s+/g, " ");
    if (!cleaned)
        return null;
    const lastSpace = cleaned.lastIndexOf(" ");
    if (lastSpace < 1)
        return null;
    const tail = cleaned.slice(lastSpace + 1);
    let chapterStr = tail;
    let verseStr;
    const colon = tail.indexOf(":");
    const dot = tail.indexOf(".");
    const sepIdx = colon >= 0 ? colon : dot;
    if (sepIdx >= 0) {
        chapterStr = tail.slice(0, sepIdx);
        verseStr = tail.slice(sepIdx + 1);
    }
    const chapter = parseInt(chapterStr, 10);
    if (isNaN(chapter))
        return null;
    const verse = verseStr ? parseInt(verseStr, 10) : undefined;
    const bookQuery = cleaned.slice(0, lastSpace).trim();
    const book = findBook(bookQuery, preparedBooks);
    if (!book)
        return null;
    return { book, chapter, verse };
}
function buildVerseResult(pv) {
    return {
        type: "verse",
        book: pv.book,
        chapter: pv.chapter,
        verse: pv.verse,
    };
}
function buildSongResult(ps, qNorm, score) {
    const matchedTitle = ps.titleLower.includes(qNorm);
    const result = {
        type: "song",
        song: ps.song,
        score,
        matchedField: matchedTitle ? "title" : "lyrics",
    };
    if (!matchedTitle) {
        const idx = ps.lyricsLower.indexOf(qNorm);
        if (idx >= 0) {
            result.matchedText = ps.lyrics.slice(idx, idx + 120).split("\n")[0];
        }
    }
    return result;
}
export async function searchUnified(prepared, query, opts = {}, token) {
    const q = query.trim();
    if (!q)
        return [];
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const qNorm = normalizeArabic(q);
    const results = [];
    const isCancelled = () => token?.cancelled === true;
    if (prepared.bible) {
        const ref = parseReference(q, prepared.books);
        if (ref) {
            const chKey = `${ref.book.id}:${ref.chapter}`;
            if (ref.verse !== undefined) {
                const pv = prepared.verseLookup.get(`${chKey}:${ref.verse}`);
                if (pv)
                    results.push(buildVerseResult(pv));
            }
            else {
                const chVerses = prepared.chapterIndex.get(chKey);
                if (chVerses && chVerses.length > 0) {
                    results.push({
                        type: "chapter",
                        book: ref.book,
                        chapter: ref.chapter,
                        verses: chVerses.map((pv) => pv.verse),
                    });
                }
            }
        }
    }
    if (isCancelled())
        return [];
    const songResults = [];
    if (prepared.fuse) {
        const songHits = prepared.fuse.search(qNorm, { limit: SONG_FUZZY_LIMIT });
        for (const hit of songHits) {
            songResults.push(buildSongResult(hit.item, qNorm, hit.score ?? 1));
        }
    }
    else {
        for (const ps of prepared.songs) {
            if (ps.titleLower.includes(qNorm) || ps.lyricsLower.includes(qNorm)) {
                songResults.push(buildSongResult(ps, qNorm, 1));
                if (songResults.length >= SONG_FUZZY_LIMIT)
                    break;
            }
        }
    }
    songResults.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
    results.push(...songResults);
    if (isCancelled())
        return [];
    if (prepared.bible && qNorm.length >= 2) {
        let found = 0;
        const verses = prepared.verses;
        const total = verses.length;
        for (let i = 0; i < total; i++) {
            const pv = verses[i];
            if (pv.textLower.includes(qNorm)) {
                results.push({
                    type: "verse",
                    book: pv.book,
                    chapter: pv.chapter,
                    verse: pv.verse,
                    matchedText: pv.verse.text,
                });
                found++;
                if (found >= VERSE_TEXT_LIMIT)
                    break;
            }
            if ((i & (VERSE_SCAN_CHUNK - 1)) === 0 && i > 0) {
                await yieldToMain();
                if (isCancelled())
                    return [];
            }
        }
    }
    return results.slice(0, limit);
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function highlight(text, query) {
    if (!query)
        return text;
    const qNorm = normalizeArabic(query);
    if (!qNorm)
        return text;
    const escaped = escapeRegex(query);
    const literal = new RegExp(`(${escaped})`, "gi");
    if (literal.test(text)) {
        return text.replace(literal, '<mark class="highlight">$1</mark>');
    }
    const tokens = text.split(/(\s+)/);
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!t || /^\s+$/.test(t))
            continue;
        if (normalizeArabic(t).includes(qNorm)) {
            tokens[i] = `<mark class="highlight">${t}</mark>`;
        }
    }
    return tokens.join("");
}
export async function createSearchEngine(data) {
    return buildPreparedData(data);
}
