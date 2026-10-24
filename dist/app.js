// @format
import { SectionType } from "./types.js";
import { createSearchEngine, searchUnified, yieldToMain, } from "./search.js";
const INPUT_DEBOUNCE_MS = 150;
// ============================================================================
// ======================= GLOBALS ============================================
// ============================================================================
let engine = null;
let globalBackgroundColor = "#0b0b0b";
let globalFontColor = "#ffffff";
const search = document.querySelector("#search");
const searchResult = document.querySelector("#searchResult");
const slidesEl = document.getElementById("slides");
const previewWin = document.getElementById("previewWindow");
const setlist = document.getElementById("setlist");
let activeDrag = null;
const DRAG_MIME = "application/x-zoxa-drag";
const searchResultByElement = new WeakMap();
function resultDisplayName(result) {
    if (result.type === "song")
        return result.song.title;
    if (result.type === "chapter")
        return `${result.book.nameAr} ${result.chapter}`;
    return `${result.book.nameAr} ${result.chapter}:${result.verse.number}`;
}
// ============================================================================
// ===================== PERSISTENCE (localStorage) ===========================
// ============================================================================
const STORAGE_PREFIX = "zoxa.v1.";
const STORAGE_KEYS = {
    colors: STORAGE_PREFIX + "colors",
    slides: STORAGE_PREFIX + "slides",
    setlist: STORAGE_PREFIX + "setlist",
    lowerThird: STORAGE_PREFIX + "lowerThird",
    currentIndex: STORAGE_PREFIX + "currentIndex",
};
const saveTimers = new Map();
const saveFns = {};
function scheduleSave(key, delayMs = 250) {
    const existing = saveTimers.get(key);
    if (existing !== undefined)
        window.clearTimeout(existing);
    const handle = window.setTimeout(() => {
        saveTimers.delete(key);
        saveFns[key]?.();
    }, delayMs);
    saveTimers.set(key, handle);
}
function flushSaves() {
    for (const key of Array.from(saveTimers.keys())) {
        window.clearTimeout(saveTimers.get(key));
    }
    saveTimers.clear();
    for (const key of Object.keys(saveFns))
        saveFns[key]();
}
function readJSON(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw)
            return null;
        return JSON.parse(raw);
    }
    catch (err) {
        console.warn(`Could not read ${key} from localStorage:`, err);
        return null;
    }
}
function writeJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    }
    catch (err) {
        console.warn(`Could not persist ${key}:`, err);
    }
}
// ----------------------------------------------------------------------------
// Colors
// ----------------------------------------------------------------------------
function saveColorsNow() {
    writeJSON(STORAGE_KEYS.colors, {
        bg: globalBackgroundColor,
        font: globalFontColor,
    });
}
function loadColors() {
    const parsed = readJSON(STORAGE_KEYS.colors);
    if (!parsed)
        return;
    if (typeof parsed.bg === "string" && parsed.bg.trim())
        globalBackgroundColor = parsed.bg;
    if (typeof parsed.font === "string" && parsed.font.trim())
        globalFontColor = parsed.font;
}
function serializeSlides() {
    return getSlides().map((slide) => {
        const body = slide.querySelector(".slide-body");
        const labelEl = slide.querySelector(".slide-label");
        return {
            html: body ? body.innerHTML : slide.innerHTML,
            label: labelEl ? labelEl.textContent ?? undefined : undefined,
            bgColor: slide.style.backgroundColor || undefined,
            fontColor: slide.style.color || undefined,
        };
    });
}
function saveSlidesNow() {
    if (!slidesEl)
        return;
    writeJSON(STORAGE_KEYS.slides, serializeSlides());
}
function restoreSlides() {
    if (!slidesEl)
        return;
    const stored = readJSON(STORAGE_KEYS.slides);
    if (!Array.isArray(stored) || stored.length === 0)
        return;
    slidesEl.replaceChildren();
    for (const s of stored) {
        if (!s || typeof s.html !== "string")
            continue;
        const btn = makeSlideButton(s.html, s.label || undefined);
        if (s.bgColor)
            btn.style.backgroundColor = s.bgColor;
        if (s.fontColor)
            btn.style.color = s.fontColor;
        slidesEl.appendChild(btn);
    }
}
// ----------------------------------------------------------------------------
// Lower-third mode
// ----------------------------------------------------------------------------
function saveLowerThirdNow() {
    writeJSON(STORAGE_KEYS.lowerThird, lowerThirdMode);
}
function loadLowerThird() {
    const parsed = readJSON(STORAGE_KEYS.lowerThird);
    if (typeof parsed === "boolean")
        lowerThirdMode = parsed;
}
// ----------------------------------------------------------------------------
// Current index
// ----------------------------------------------------------------------------
function saveCurrentIndexNow() {
    writeJSON(STORAGE_KEYS.currentIndex, currentIndex);
}
function loadCurrentIndex() {
    const parsed = readJSON(STORAGE_KEYS.currentIndex);
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}
function saveSetlistNow() {
    writeJSON(STORAGE_KEYS.setlist, setlistState);
}
function restoreSetlist() {
    if (!setlist)
        return;
    const stored = readJSON(STORAGE_KEYS.setlist);
    if (!Array.isArray(stored) || stored.length === 0)
        return;
    setlistState.length = 0;
    setlist.replaceChildren();
    let maxId = 0;
    for (const rec of stored) {
        if (rec && typeof rec.id === "string" && rec.id.startsWith("sl_")) {
            const n = parseInt(rec.id.slice(3), 10);
            if (Number.isFinite(n) && n > maxId)
                maxId = n;
        }
    }
    idCounter = Math.max(idCounter, maxId);
    let currentSectionBox = null;
    for (const rec of stored) {
        if (!rec || typeof rec.name !== "string")
            continue;
        if (rec.kind === "section") {
            const record = {
                id: rec.id || nextId(),
                kind: "section",
                name: rec.name,
            };
            setlistState.push(record);
            currentSectionBox = createSectionBox(record.name);
            currentSectionBox.dataset.sectionId = record.id;
            setlist.appendChild(currentSectionBox);
        }
        else if (rec.kind === "item") {
            if (!currentSectionBox) {
                const implicit = {
                    id: nextId(),
                    kind: "section",
                    name: "Setlist",
                };
                setlistState.push(implicit);
                currentSectionBox = createSectionBox(implicit.name);
                currentSectionBox.dataset.sectionId = implicit.id;
                setlist.appendChild(currentSectionBox);
            }
            const record = {
                id: rec.id || nextId(),
                kind: "item",
                name: rec.name,
                result: rec.result,
            };
            setlistState.push(record);
            const item = createItemBox(record);
            const itemsEl = currentSectionBox.querySelector(".setlist-items");
            itemsEl?.appendChild(item);
        }
    }
}
saveFns[STORAGE_KEYS.colors] = saveColorsNow;
saveFns[STORAGE_KEYS.slides] = saveSlidesNow;
saveFns[STORAGE_KEYS.setlist] = saveSetlistNow;
saveFns[STORAGE_KEYS.lowerThird] = saveLowerThirdNow;
saveFns[STORAGE_KEYS.currentIndex] = saveCurrentIndexNow;
// ============================================================================
// ============================ SEARCH UI =====================================
// ============================================================================
if (!search || !searchResult) {
    console.error("Zoxa search: #search or #searchResult is missing.");
}
else {
    const searchEl = search;
    const resultEl = searchResult;
    resultEl.textContent = "Loading search data...";
    resultEl.style.contain = "content";
    resultEl.style.willChange = "contents";
    let debounceHandle = null;
    function debounced(fn, ms) {
        if (debounceHandle !== null)
            clearTimeout(debounceHandle);
        debounceHandle = window.setTimeout(fn, ms);
    }
    let currentToken = null;
    async function initializeSearch() {
        try {
            // Fetch both files at the same time
            const [songsRes, bibleRes] = await Promise.all([
                fetch("./data/songs.json"),
                fetch("./data/bible.json")
            ]);
            if (!songsRes.ok)
                throw new Error(`Songs HTTP ${songsRes.status}`);
            if (!bibleRes.ok)
                throw new Error(`Bible HTTP ${bibleRes.status}`);
            const songsData = await songsRes.json();
            const bibleData = await bibleRes.json();
            // Combine them into one object for the search engine
            const combinedData = {
                version: songsData.version || 1,
                songs: songsData.songs || [],
                bible: bibleData.bible
            };
            await yieldToMain();
            engine = await createSearchEngine(combinedData);
            if (window.__ZOXA_DEBUG__) {
                console.log("Zoxa search is ready.");
                console.log("Songs indexed:", engine.songs.length);
                console.log("Bible verses indexed:", engine.verses.length);
            }
            resultEl.textContent = "Start typing to search.";
        }
        catch (error) {
            console.error("Failed to initialize Zoxa search:", error);
            resultEl.textContent =
                "Could not load search data. Check the console and JSON path.";
        }
    }
    async function runSearch() {
        if (!engine)
            return;
        const query = searchEl.value.trim();
        if (!query) {
            currentToken = null;
            resultEl.textContent = "Start typing to search.";
            return;
        }
        if (currentToken)
            currentToken.cancelled = true;
        const token = { cancelled: false };
        currentToken = token;
        const prevScroll = resultEl.scrollTop;
        let results;
        try {
            results = await searchUnified(engine, query, { limit: 40 }, token);
        }
        catch (err) {
            if (token.cancelled)
                return;
            console.error("Search failed", err);
            return;
        }
        if (token.cancelled || currentToken !== token)
            return;
        const frag = document.createDocumentFragment();
        if (results.length === 0) {
            const empty = document.createElement("p");
            empty.textContent = "No results found.";
            frag.appendChild(empty);
        }
        else {
            const heading = document.createElement("p");
            heading.textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;
            frag.appendChild(heading);
            for (const result of results) {
                const card = document.createElement("div");
                card.setAttribute("role", "button");
                card.tabIndex = 0;
                card.className = "searchBtnR";
                card.draggable = true;
                card.style.display = "block";
                card.style.textAlign = "start";
                card.style.contentVisibility = "auto";
                card.style.containIntrinsicSize = "auto 80px";
                const title = document.createElement("strong");
                const description = document.createElement("p");
                if (result.type === "song") {
                    title.textContent = result.song.title;
                    description.textContent =
                        result.matchedText ?? `Song · ${result.song.sections.length} sections`;
                }
                else if (result.type === "chapter") {
                    title.textContent = `${result.book.nameAr} ${result.chapter}`;
                    description.textContent = `${result.verses.length} verses`;
                }
                else {
                    title.textContent = `${result.book.nameAr} ${result.chapter}:${result.verse.number}`;
                    description.textContent = result.verse.text;
                }
                card.append(title, description);
                try {
                    card.dataset.result = JSON.stringify(result);
                }
                catch { }
                searchResultByElement.set(card, result);
                card.addEventListener("click", () => {
                    const payload = searchResultByElement.get(card);
                    if (!payload)
                        return;
                    resultEl.dispatchEvent(new CustomEvent("zoxa:search-select", { bubbles: true, detail: payload }));
                });
                card.addEventListener("keydown", (ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        card.click();
                    }
                });
                card.addEventListener("dragstart", (ev) => {
                    activeDrag = { kind: "search-result", result };
                    ev.dataTransfer?.setData(DRAG_MIME, "search-result");
                    ev.dataTransfer?.setData("text/plain", resultDisplayName(result));
                    if (ev.dataTransfer)
                        ev.dataTransfer.effectAllowed = "copy";
                    card.classList.add("dragging");
                });
                card.addEventListener("dragend", () => {
                    activeDrag = null;
                    card.classList.remove("dragging");
                });
                frag.appendChild(card);
            }
        }
        resultEl.replaceChildren(frag);
        resultEl.scrollTop = prevScroll;
    }
    searchEl.addEventListener("input", () => {
        debounced(() => void runSearch(), INPUT_DEBOUNCE_MS);
    });
    if (typeof globalThis.requestIdleCallback === "function") {
        globalThis.requestIdleCallback(() => void initializeSearch(), { timeout: 500 });
    }
    else {
        setTimeout(() => void initializeSearch(), 0);
    }
}
function buildSongDisplaySlides(song) {
    const sections = song.sections
        .slice()
        .sort((a, b) => a.position - b.position);
    const makeSlides = (section, labelFor) => section.slides
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((slide, i) => ({
        slideId: slide.id,
        position: slide.position,
        heading: slide.heading,
        label: labelFor(i),
        segments: slide.segments
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((seg) => seg.content),
    }));
    const hasVerse = sections.some((s) => s.type === SectionType.VERSE);
    if (!hasVerse) {
        return sections.flatMap((section) => makeSlides(section, () => section.type === SectionType.VERSE
            ? `عدد ${section.position}`
            : section.type === SectionType.CHORUS
                ? `قرار ${section.position}`
                : undefined));
    }
    const chorusSlides = sections
        .filter((section) => section.type === SectionType.CHORUS)
        .flatMap((section) => makeSlides(section, () => `قرار ${section.position}`));
    const displaySlides = [];
    let verseCounter = 0;
    let chorusCounter = 0;
    for (const section of sections) {
        if (section.type === SectionType.CHORUS)
            continue;
        displaySlides.push(...makeSlides(section, () => section.type === SectionType.VERSE ? `عدد ${++verseCounter}` : undefined));
        if (section.type === SectionType.VERSE && chorusSlides.length > 0) {
            displaySlides.push(...chorusSlides.map((slide) => ({
                ...slide,
                label: `قرار ${++chorusCounter}`,
            })));
        }
    }
    return displaySlides;
}
function makeSlideButton(content, labelText) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slide";
    btn.style.textAlign = "center";
    btn.style.whiteSpace = "pre-line";
    btn.style.color = globalFontColor;
    btn.style.backgroundColor = globalBackgroundColor;
    const body = document.createElement("div");
    body.className = "slide-body";
    body.innerHTML = content;
    btn.appendChild(body);
    if (labelText) {
        const label = document.createElement("div");
        label.className = "slide-label";
        label.textContent = labelText;
        btn.appendChild(label);
    }
    return btn;
}
function addEmptySlideAtEnd() {
    if (!slidesEl)
        return;
    slidesEl.appendChild(makeSlideButton(""));
}
function renderSearchResult(detail) {
    if (!slidesEl)
        return;
    if (detail.type === "song") {
        const slides = buildSongDisplaySlides(detail.song);
        slidesEl.replaceChildren();
        slides.forEach((slide) => {
            slidesEl.appendChild(makeSlideButton(slide.segments.join("<br>"), slide.label || undefined));
        });
        addEmptySlideAtEnd();
        resetNavigation();
        scheduleSave(STORAGE_KEYS.slides);
        return;
    }
    if (detail.type === "verse") {
        slidesEl.replaceChildren();
        const labelText = `${detail.book.nameAr} ${detail.chapter}:${detail.verse.number}`;
        slidesEl.appendChild(makeSlideButton(`${detail.verse.text}<br>`, labelText));
        addEmptySlideAtEnd();
        resetNavigation();
        scheduleSave(STORAGE_KEYS.slides);
        return;
    }
    if (detail.type === "chapter") {
        slidesEl.replaceChildren();
        for (const verse of detail.verses) {
            const labelText = `${detail.book.nameAr} ${detail.chapter}:${verse.number}`;
            slidesEl.appendChild(makeSlideButton(verse.text, labelText));
        }
        addEmptySlideAtEnd();
        resetNavigation();
        scheduleSave(STORAGE_KEYS.slides);
    }
}
document.addEventListener("zoxa:search-select", (ev) => {
    const detail = ev.detail;
    if (detail)
        renderSearchResult(detail);
});
// ============================================================================
// ============================= PREVIEW ======================================
// ============================================================================
function getSlideBodyText(slide) {
    return (slide.querySelector(".slide-body")?.innerText ?? slide.innerText);
}
function updatePreviewAndView(slide) {
    if (!previewWin || !slide)
        return;
    const slideBody = slide.querySelector(".slide-body");
    const bodyHtml = slideBody ? slideBody.innerHTML : slide.innerHTML;
    const isLowerThird = lowerThirdMode;
    const bgColor = isLowerThird
        ? "transparent"
        : slide.style.background || slide.style.backgroundColor || globalBackgroundColor;
    const fontColor = isLowerThird ? "#ffffff" : slide.style.color || globalFontColor;
    previewWin.innerHTML = isLowerThird ? getLowerThirdText(getSlideBodyText(slide)) : bodyHtml;
    previewWin.style.background = bgColor;
    previewWin.style.backgroundColor = bgColor;
    previewWin.style.color = fontColor;
    updateViewWindow(previewWin.innerHTML, isLowerThird, bgColor, fontColor);
}
slidesEl?.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || !previewWin)
        return;
    const slide = target.closest(".slide");
    if (!slide)
        return;
    const clickedIndex = getSlides().indexOf(slide);
    if (clickedIndex !== -1)
        goToSlide(clickedIndex, true);
});
// ============================================================================
// ============================= SHORTCUTS ====================================
// ============================================================================
function setupShortcuts() {
    const preview = document.getElementById("previewWindow");
    const searchInput = document.querySelector("#search");
    document.addEventListener("keydown", (event) => {
        if (event.ctrlKey && !event.shiftKey && !event.altKey && event.code === "KeyB") {
            event.preventDefault();
            if (preview)
                preview.innerHTML = "";
            clearPreview();
            return;
        }
        if (event.key === "Escape") {
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
            return;
        }
    });
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupShortcuts);
}
else {
    setupShortcuts();
}
// ============================================================================
// ========================= SLIDE NAVIGATION =================================
// ============================================================================
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const blankBtn = document.getElementById("blank");
const clearBtn = document.getElementById("clearPreview");
let currentIndex = -1;
let lowerThirdMode = false;
function getLowerThirdText(value) {
    const lines = (value ?? "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    return lines[0] || "";
}
function getSlides() {
    return slidesEl ? Array.from(slidesEl.querySelectorAll(".slide")) : [];
}
function goToSlide(index, updateScreens = true) {
    const slides = getSlides();
    if (slides.length === 0)
        return;
    if (index < 0)
        index = 0;
    if (index >= slides.length)
        index = slides.length - 1;
    currentIndex = index;
    scheduleSave(STORAGE_KEYS.currentIndex);
    slides.forEach((s, i) => s.classList.toggle("active", i === currentIndex));
    const current = slides[currentIndex];
    current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const currentText = getSlideBodyText(current);
    const nextSlide = slides[currentIndex + 1];
    const nextText = nextSlide ? getSlideBodyText(nextSlide) : "";
    if (updateScreens) {
        updatePreviewAndView(current);
    }
    updateMonitorWindow(currentText, nextText);
}
function resetNavigation() {
    goToSlide(0, true);
}
prevBtn?.addEventListener("click", () => goToSlide(currentIndex - 1, true));
nextBtn?.addEventListener("click", () => goToSlide(currentIndex + 1, true));
function clearPreview() {
    if (previewWin)
        previewWin.innerHTML = "";
    updateViewWindow("", lowerThirdMode, lowerThirdMode ? "transparent" : globalBackgroundColor, lowerThirdMode ? "#ffffff" : globalFontColor);
}
blankBtn?.addEventListener("click", clearPreview);
clearBtn?.addEventListener("click", clearPreview);
document.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA")
        return;
    if (event.key === "ArrowRight") {
        event.preventDefault();
        goToSlide(currentIndex - 1, true);
    }
    if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToSlide(currentIndex + 1, true);
    }
});
const setlistState = [];
let idCounter = 0;
function nextId() {
    return `sl_${++idCounter}`;
}
function removeSetlistRecord(id) {
    const idx = setlistState.findIndex((r) => r.id === id);
    if (idx === -1)
        return;
    setlistState.splice(idx, 1);
    scheduleSave(STORAGE_KEYS.setlist);
}
function removeSetlistSection(id) {
    const sectionIdx = setlistState.findIndex((r) => r.id === id);
    if (sectionIdx === -1)
        return;
    let end = setlistState.length;
    for (let i = sectionIdx + 1; i < setlistState.length; i++) {
        if (setlistState[i].kind === "section") {
            end = i;
            break;
        }
    }
    setlistState.splice(sectionIdx, end - sectionIdx);
    scheduleSave(STORAGE_KEYS.setlist);
}
function createSectionBox(name) {
    const id = nextId();
    const box = document.createElement("div");
    box.className = "setlist-section";
    box.dataset.sectionId = id;
    box.dataset.kind = "section";
    const titleRow = document.createElement("div");
    titleRow.className = "setlist-section-title";
    const input = document.createElement("input");
    input.type = "text";
    input.value = name;
    input.setAttribute("aria-label", "Section name");
    input.addEventListener("input", () => {
        const rec = setlistState.find((r) => r.id === id);
        if (rec)
            rec.name = input.value;
        scheduleSave(STORAGE_KEYS.setlist);
    });
    input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter")
            input.blur();
    });
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "section-remove";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove section";
    removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeSetlistSection(id);
        box.remove();
    });
    titleRow.append(input, removeBtn);
    const itemsEl = document.createElement("div");
    itemsEl.className = "setlist-items";
    itemsEl.dataset.sectionId = id;
    box.append(titleRow, itemsEl);
    return box;
}
function createItemBox(record) {
    const item = document.createElement("div");
    item.className = "setlist-item";
    item.draggable = true;
    item.dataset.id = record.id;
    item.dataset.kind = "item";
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.textContent = "☰";
    handle.title = "Drag to reorder";
    const label = document.createElement("span");
    label.className = "setlist-label";
    label.textContent = record.name;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "removeItem";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeSetlistRecord(record.id);
        item.remove();
    });
    if (record.result) {
        try {
            item.dataset.result = JSON.stringify(record.result);
        }
        catch { }
    }
    item.addEventListener("click", () => {
        if (!record.result)
            return;
        renderSearchResult(record.result);
    });
    item.addEventListener("dragstart", (ev) => {
        activeDrag = { kind: "setlist-item", element: item };
        item.classList.add("dragging");
        ev.dataTransfer?.setData(DRAG_MIME, "setlist-item");
        if (ev.dataTransfer)
            ev.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        activeDrag = null;
        scheduleSave(STORAGE_KEYS.setlist);
    });
    item.append(handle, label, removeBtn);
    return item;
}
function addSection(name) {
    if (!setlist)
        return null;
    const sectionName = (name ?? "New Section").trim() || "New Section";
    const record = { id: nextId(), kind: "section", name: sectionName };
    setlistState.push(record);
    scheduleSave(STORAGE_KEYS.setlist);
    const box = createSectionBox(sectionName);
    box.dataset.sectionId = record.id;
    setlist.appendChild(box);
    return box;
}
function appendItemToSection(sectionBox, name, result) {
    const record = { id: nextId(), kind: "item", name, result };
    setlistState.push(record);
    scheduleSave(STORAGE_KEYS.setlist);
    const item = createItemBox(record);
    const itemsEl = sectionBox.querySelector(".setlist-items");
    itemsEl?.appendChild(item);
    return item;
}
if (setlist) {
    const listEl = setlist;
    function findSectionBoxAt(clientY) {
        const boxes = Array.from(listEl.querySelectorAll(".setlist-section"));
        for (const box of boxes) {
            const rect = box.getBoundingClientRect();
            if (clientY >= rect.top && clientY <= rect.bottom)
                return box;
        }
        return boxes.length ? boxes[boxes.length - 1] : null;
    }
    function getDropReference(container, clientY) {
        const items = Array.from(container.querySelectorAll(".setlist-item:not(.dragging)"));
        for (const el of items) {
            const rect = el.getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2)
                return el;
        }
        return null;
    }
    listEl.addEventListener("dragover", (ev) => {
        if (!activeDrag)
            return;
        ev.preventDefault();
        if (ev.dataTransfer) {
            ev.dataTransfer.dropEffect =
                activeDrag.kind === "search-result" ? "copy" : "move";
        }
        if (activeDrag.kind === "setlist-item" && activeDrag.element) {
            const box = findSectionBoxAt(ev.clientY);
            if (!box)
                return;
            const itemsEl = box.querySelector(".setlist-items");
            if (!itemsEl)
                return;
            const moving = activeDrag.element;
            const ref = getDropReference(itemsEl, ev.clientY);
            if (ref === moving)
                return;
            if (ref)
                itemsEl.insertBefore(moving, ref);
            else
                itemsEl.appendChild(moving);
        }
    });
    listEl.addEventListener("drop", (ev) => {
        if (!activeDrag)
            return;
        ev.preventDefault();
        if (activeDrag.kind === "search-result" && activeDrag.result) {
            const result = activeDrag.result;
            const name = resultDisplayName(result);
            let sectionBox = findSectionBoxAt(ev.clientY);
            if (!sectionBox)
                sectionBox = addSection("Setlist");
            if (!sectionBox)
                return;
            const itemsEl = sectionBox.querySelector(".setlist-items");
            if (!itemsEl)
                return;
            const ref = getDropReference(itemsEl, ev.clientY);
            const item = appendItemToSection(sectionBox, name, result);
            if (ref && ref.parentElement === itemsEl)
                itemsEl.insertBefore(item, ref);
            scheduleSave(STORAGE_KEYS.setlist);
        }
        activeDrag = null;
    });
}
const addsectionBtn = document.getElementById("addSectionbtn");
addsectionBtn?.addEventListener("click", () => {
    const sectionName = window.prompt("Type your section name:");
    if (sectionName === null)
        return;
    const name = sectionName.trim();
    if (!name)
        return;
    addSection(name);
});
// ============================================================================
// ========================= QUICK ACTION =====================================
// ============================================================================
const addSlideBtn = document.getElementById("addSlide");
const addSlideModal = document.getElementById("addSlideModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const closeModalX = document.getElementById("closeModalX");
const createSlideBtn = document.getElementById("createSlideBtn");
const newSlideBody = document.getElementById("newSlideBody");
addSlideBtn?.addEventListener("click", () => {
    if (!addSlideModal || !newSlideBody)
        return;
    addSlideModal.classList.remove("hidden");
    newSlideBody.value = "";
    newSlideBody.focus();
});
const closeAddSlideModal = () => addSlideModal?.classList.add("hidden");
closeModalBtn?.addEventListener("click", closeAddSlideModal);
closeModalX?.addEventListener("click", closeAddSlideModal);
createSlideBtn?.addEventListener("click", () => {
    if (!newSlideBody)
        return;
    const text = newSlideBody.value.trim();
    if (!text)
        return;
    const slidesContent = text.split(/\n\s*\n/).filter((s) => s.trim() !== "");
    if (slidesEl)
        slidesEl.replaceChildren();
    slidesContent.forEach((content) => {
        slidesEl?.appendChild(makeSlideButton(`${content} <br>`));
    });
    resetNavigation();
    closeAddSlideModal();
    scheduleSave(STORAGE_KEYS.slides);
});
// ============================================================================
// ========================= EXTERNAL WINDOWS =================================
// ============================================================================
let monitorWindow = null;
let viewWindow = null;
const openMoniterScreen = document.getElementById("openMoniterScreen");
openMoniterScreen?.addEventListener("click", () => {
    const monitorUrl = new URL("./htmlFIles/moniter.html", window.location.href).toString();
    monitorWindow = window.open(monitorUrl, "MonitorWindow", "width=900,height=700");
    if (!monitorWindow) {
        alert("Please allow popups to open the Monitor window.");
        return;
    }
    monitorWindow.focus();
    if (currentIndex >= 0) {
        const current = getSlides()[currentIndex];
        const next = getSlides()[currentIndex + 1];
        updateMonitorWindow(current ? getSlideBodyText(current) : "", next ? getSlideBodyText(next) : "");
    }
});
function updateMonitorWindow(currentSlideText, nextSlideText) {
    const current = currentSlideText.trim() || "—";
    const next = nextSlideText.trim() || "—";
    if (monitorWindow && !monitorWindow.closed) {
        monitorWindow.postMessage({ type: "UPDATE_SLIDES", current, next }, "*");
    }
}
const liveBtn = document.getElementById("liveBtn");
liveBtn?.addEventListener("click", () => {
    const viewURl = new URL("./htmlFIles/view.html", window.location.href).toString();
    viewWindow = window.open(viewURl, "viewWindow", "width=1920,height=1080");
    if (!viewWindow) {
        alert("Please allow popups to open the People View.");
        return;
    }
    viewWindow.focus();
    window.setTimeout(() => {
        broadcastLogoToView();
        const slides = getSlides();
        if (currentIndex >= 0 && slides[currentIndex]) {
            updatePreviewAndView(slides[currentIndex]);
        }
    }, 250);
});
function updateViewWindow(slideHTML, isLowerThird = false, bgColor = "#000000", fontColor = "#ffffff") {
    if (viewWindow && !viewWindow.closed) {
        viewWindow.postMessage({
            type: "UPDATE_VIEW",
            content: slideHTML ?? "",
            isLowerThird,
            bgColor,
            fontColor,
        }, "*");
    }
}
let colorMode = "bg";
const changeColorBg = document.getElementById("changeColorBg");
const fontColorBtn = document.getElementById("changeFontColor");
const colorModal = document.getElementById("colorModal");
const closeColorModal = document.getElementById("closeColorModal");
const colorPicker = document.getElementById("colorPicker");
const fontColorPicker = document.getElementById("FontcolorPicker");
const applyColorBtn = document.getElementById("applyColorBtn");
function openColorModal(mode) {
    if (!colorModal)
        return;
    colorMode = mode;
    if (colorPicker)
        colorPicker.value = globalBackgroundColor;
    if (fontColorPicker)
        fontColorPicker.value = globalFontColor;
    colorModal.classList.remove("hidden");
}
changeColorBg?.addEventListener("click", () => openColorModal("bg"));
fontColorBtn?.addEventListener("click", () => openColorModal("font"));
const closeColorModalFn = () => colorModal?.classList.add("hidden");
closeColorModal?.addEventListener("click", closeColorModalFn);
applyColorBtn?.addEventListener("click", () => {
    const slides = getSlides();
    if (colorMode === "bg") {
        if (colorPicker)
            globalBackgroundColor = colorPicker.value;
        slides.forEach((slide) => {
            slide.style.backgroundColor = globalBackgroundColor;
            slide.style.color = globalFontColor;
        });
    }
    else {
        if (fontColorPicker)
            globalFontColor = fontColorPicker.value;
        slides.forEach((slide) => {
            slide.style.color = globalFontColor;
        });
    }
    if (slides[currentIndex]) {
        updatePreviewAndView(slides[currentIndex]);
    }
    scheduleSave(STORAGE_KEYS.colors);
    scheduleSave(STORAGE_KEYS.slides);
    closeColorModalFn();
});
// ============================================================================
// ========================= LOWER-THIRD TOGGLES ==============================
// ============================================================================
const lowerThirdBtn = document.getElementById("lowerThird");
const addLowerThirdNotesBtn = document.getElementById("addLowerThirdNotes");
const removeLowerThirdNotesBtn = document.getElementById("RemoveLowerThirdNotes");
function setLowerThirdMode(value) {
    lowerThirdMode = value;
    scheduleSave(STORAGE_KEYS.lowerThird);
    goToSlide(currentIndex >= 0 ? currentIndex : 0, true);
}
addLowerThirdNotesBtn?.addEventListener("click", () => setLowerThirdMode(true));
removeLowerThirdNotesBtn?.addEventListener("click", () => setLowerThirdMode(false));
lowerThirdBtn?.addEventListener("click", () => setLowerThirdMode(!lowerThirdMode));
const LOGO_STORAGE_KEY = "zoxa.churchLogo";
let logoState = null;
const logoLayer = document.getElementById("logoLayer");
const logoModal = document.getElementById("logoModal");
const closeLogoModalBtn = document.getElementById("closeLogoModal");
const logoCancelBtn = document.getElementById("logoCancelBtn");
const logoApplyBtn = document.getElementById("logoApplyBtn");
const logoFileInput = document.getElementById("logoFile");
const logoUrlInput = document.getElementById("logoUrl");
const logoPreviewImg = document.getElementById("logoPreview");
const logoSizeInput = document.getElementById("logoSize");
const logoSizeValue = document.getElementById("logoSizeValue");
const logoOpacityInput = document.getElementById("logoOpacity");
const logoOpacityValue = document.getElementById("logoOpacityValue");
const logoPositionGroup = document.getElementById("logoPositionGroup");
const addChurchLogoBtn = document.getElementById("addChurchLogo");
const removeChurchLogoBtn = document.getElementById("removeChurchLogo");
let pendingLogo = null;
function saveLogoState() {
    try {
        if (logoState)
            localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(logoState));
        else
            localStorage.removeItem(LOGO_STORAGE_KEY);
    }
    catch (err) {
        console.warn("Could not persist church logo:", err);
    }
}
function loadLogoState() {
    try {
        const raw = localStorage.getItem(LOGO_STORAGE_KEY);
        if (!raw)
            return;
        const parsed = JSON.parse(raw);
        if (typeof parsed.dataUrl === "string" &&
            parsed.dataUrl.startsWith("data:image/") &&
            ["top-left", "top-right", "bottom-left", "bottom-right"].includes(parsed.position) &&
            typeof parsed.sizePercent === "number" &&
            typeof parsed.opacity === "number") {
            logoState = parsed;
        }
    }
    catch (err) {
        console.warn("Could not restore church logo:", err);
    }
}
function renderLogoInStage() {
    if (!logoLayer)
        return;
    logoLayer.replaceChildren();
    if (!logoState)
        return;
    const img = document.createElement("img");
    img.className = "church-logo";
    img.src = logoState.dataUrl;
    img.alt = "Church logo";
    img.dataset.pos = logoState.position;
    img.style.width = `${logoState.sizePercent}%`;
    img.style.height = "auto";
    img.style.opacity = String(logoState.opacity / 100);
    logoLayer.appendChild(img);
}
function broadcastLogoToView() {
    if (!viewWindow || viewWindow.closed)
        return;
    viewWindow.postMessage({
        type: "UPDATE_LOGO",
        logo: logoState
            ? {
                dataUrl: logoState.dataUrl,
                position: logoState.position,
                sizePercent: logoState.sizePercent,
                opacity: logoState.opacity,
            }
            : null,
    }, "*");
}
function applyLogoState() {
    renderLogoInStage();
    broadcastLogoToView();
    saveLogoState();
}
function setLogoPositionUI(pos) {
    if (!logoPositionGroup)
        return;
    logoPositionGroup.querySelectorAll(".logo-pos").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.pos === pos ? "true" : "false");
    });
}
function updateSizeLabel(value) {
    if (logoSizeValue)
        logoSizeValue.textContent = String(value);
}
function updateOpacityLabel(value) {
    if (logoOpacityValue)
        logoOpacityValue.textContent = String(value);
}
function updatePreviewThumb(dataUrl) {
    if (!logoPreviewImg)
        return;
    if (dataUrl) {
        logoPreviewImg.src = dataUrl;
        logoPreviewImg.style.display = "block";
    }
    else {
        logoPreviewImg.removeAttribute("src");
        logoPreviewImg.style.display = "none";
    }
}
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
        reader.readAsDataURL(file);
    });
}
async function urlToDataUrl(url) {
    try {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith("image/"))
            throw new Error("Not an image");
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ""));
            reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
            reader.readAsDataURL(blob);
        });
    }
    catch (err) {
        console.warn("Could not fetch logo as data URL, using raw URL instead:", err);
        return url;
    }
}
function openLogoModal() {
    if (!logoModal)
        return;
    pendingLogo = logoState
        ? { ...logoState }
        : { dataUrl: "", position: "top-left", sizePercent: 12, opacity: 100 };
    if (logoFileInput)
        logoFileInput.value = "";
    if (logoUrlInput)
        logoUrlInput.value = "";
    if (logoSizeInput)
        logoSizeInput.value = String(pendingLogo.sizePercent);
    if (logoOpacityInput)
        logoOpacityInput.value = String(pendingLogo.opacity);
    updateSizeLabel(pendingLogo.sizePercent);
    updateOpacityLabel(pendingLogo.opacity);
    setLogoPositionUI(pendingLogo.position);
    updatePreviewThumb(pendingLogo.dataUrl || null);
    logoModal.classList.remove("hidden");
}
function closeLogoModal() {
    logoModal?.classList.add("hidden");
    pendingLogo = null;
}
addChurchLogoBtn?.addEventListener("click", openLogoModal);
removeChurchLogoBtn?.addEventListener("click", () => {
    logoState = null;
    applyLogoState();
});
closeLogoModalBtn?.addEventListener("click", closeLogoModal);
logoCancelBtn?.addEventListener("click", closeLogoModal);
logoFileInput?.addEventListener("change", async () => {
    const file = logoFileInput.files?.[0];
    if (!file || !pendingLogo)
        return;
    if (!file.type.startsWith("image/")) {
        alert("Please choose an image file.");
        logoFileInput.value = "";
        return;
    }
    try {
        const dataUrl = await readFileAsDataUrl(file);
        pendingLogo.dataUrl = dataUrl;
        updatePreviewThumb(dataUrl);
        if (logoUrlInput)
            logoUrlInput.value = "";
    }
    catch (err) {
        console.error("Failed to read logo file:", err);
        alert("Could not read that image.");
    }
});
logoUrlInput?.addEventListener("change", async () => {
    if (!pendingLogo)
        return;
    const url = logoUrlInput.value.trim();
    if (!url)
        return;
    updatePreviewThumb(url);
    const dataUrl = await urlToDataUrl(url);
    pendingLogo.dataUrl = dataUrl;
    updatePreviewThumb(dataUrl);
    if (logoFileInput)
        logoFileInput.value = "";
});
logoPositionGroup?.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".logo-pos");
    if (!btn)
        return;
    const pos = btn.dataset.pos;
    if (!pos)
        return;
    if (pendingLogo)
        pendingLogo.position = pos;
    setLogoPositionUI(pos);
});
logoSizeInput?.addEventListener("input", () => {
    const v = Number(logoSizeInput.value);
    updateSizeLabel(v);
    if (pendingLogo)
        pendingLogo.sizePercent = v;
});
logoOpacityInput?.addEventListener("input", () => {
    const v = Number(logoOpacityInput.value);
    updateOpacityLabel(v);
    if (pendingLogo)
        pendingLogo.opacity = v;
});
logoApplyBtn?.addEventListener("click", () => {
    if (!pendingLogo || !pendingLogo.dataUrl) {
        alert("Please upload an image or paste a URL first.");
        return;
    }
    logoState = { ...pendingLogo };
    applyLogoState();
    closeLogoModal();
});
// ============================================================================
// ========================= STARTUP / TEARDOWN ===============================
// ============================================================================
function restorePersistedState() {
    loadColors();
    loadLowerThird();
    restoreSlides();
    restoreSetlist();
    loadLogoState();
    renderLogoInStage();
}
function restoreCurrentIndexAfterRender() {
    const idx = loadCurrentIndex();
    if (idx === null)
        return;
    const slides = getSlides();
    if (slides.length === 0)
        return;
    goToSlide(Math.max(0, Math.min(slides.length - 1, idx)), false);
}
restorePersistedState();
restoreCurrentIndexAfterRender();
window.addEventListener("pagehide", flushSaves);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden")
        flushSaves();
});
// ============================================================================
// ========================= NAVBAR MODALS (NEWS & SETTINGS) ==================
// ============================================================================
const newsbtn = document.getElementById('newsbtn');
const newsModal = document.getElementById('newsModal');
const closeNewsModal = document.getElementById('closeNewsModal');
const closeNewsBtn = document.getElementById('closeNewsBtn');
newsbtn?.addEventListener('click', () => newsModal.classList.remove('hidden'));
closeNewsModal?.addEventListener('click', () => newsModal.classList.add('hidden'));
closeNewsBtn?.addEventListener('click', () => newsModal.classList.add('hidden'));
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModal = document.getElementById('closeSettingsModal');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const defaultFontSize = document.getElementById('defaultFontSize');
const fontSizeValue = document.getElementById('fontSizeValue');
settingsBtn?.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsModal?.addEventListener('click', () => settingsModal.classList.add('hidden'));
defaultFontSize?.addEventListener('input', () => {
    if (fontSizeValue)
        fontSizeValue.textContent = `${defaultFontSize.value}px`;
});
saveSettingsBtn?.addEventListener('click', () => {
    const newSize = defaultFontSize.value;
    localStorage.setItem("zoxa_default_font_size", newSize);
    settingsModal.classList.add('hidden');
});
const savedFontSize = localStorage.getItem("zoxa_default_font_size");
if (savedFontSize && defaultFontSize && fontSizeValue) {
    defaultFontSize.value = savedFontSize;
    fontSizeValue.textContent = `${savedFontSize}px`;
}
// ============================================================================
// ========================= COUNTDOWN TIMER ==================================
// ============================================================================
const addCountdownBtn = document.getElementById("addCountdown");
const countdownModal = document.getElementById("countdownModal");
const closeCountdownModalBtn = document.getElementById("closeCountdownModal");
const startCountdownBtn = document.getElementById("startCountdownBtn");
const countdownMinutes = document.getElementById("countdownMinutes");
const countdownOverlay = document.getElementById("countdownOverlay");
let countdownInterval = null;
addCountdownBtn?.addEventListener("click", () => {
    countdownModal?.classList.remove("hidden");
});
closeCountdownModalBtn?.addEventListener("click", () => {
    countdownModal?.classList.add("hidden");
});
startCountdownBtn?.addEventListener("click", () => {
    if (!countdownMinutes || !countdownOverlay)
        return;
    const minutes = parseInt(countdownMinutes.value, 10);
    if (isNaN(minutes) || minutes <= 0)
        return;
    if (countdownInterval !== null) {
        clearInterval(countdownInterval);
    }
    let totalSeconds = minutes * 60;
    countdownOverlay.classList.remove("hidden");
    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };
    countdownOverlay.textContent = formatTime(totalSeconds);
    if (viewWindow && !viewWindow.closed) {
        viewWindow.postMessage({
            type: "UPDATE_COUNTDOWN",
            time: formatTime(totalSeconds)
        }, "*");
    }
    countdownModal?.classList.add("hidden");
    countdownInterval = window.setInterval(() => {
        totalSeconds -= 1;
        if (totalSeconds <= 0) {
            if (countdownInterval !== null)
                clearInterval(countdownInterval);
            countdownOverlay.textContent = "00:00";
            countdownOverlay.style.color = "red";
            if (viewWindow && !viewWindow.closed) {
                viewWindow.postMessage({ type: "UPDATE_COUNTDOWN", time: "" }, "*");
            }
            return;
        }
        const timeString = formatTime(totalSeconds);
        countdownOverlay.textContent = timeString;
        if (viewWindow && !viewWindow.closed) {
            viewWindow.postMessage({
                type: "UPDATE_COUNTDOWN",
                time: timeString
            }, "*");
        }
    }, 1000);
});
// ============================================================================
// ========================= OFFLINE SERVICE WORKER ===========================
// ============================================================================
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("../sw.js")
            .then((reg) => console.log("Service Worker registered!", reg.scope))
            .catch((err) => console.error("Service Worker failed:", err));
    });
}
