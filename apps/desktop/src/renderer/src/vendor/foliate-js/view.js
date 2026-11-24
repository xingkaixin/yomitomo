import * as CFI from './epubcfi.js'
import { TOCProgress, SectionProgress } from './progress.js'
import { Overlayer } from './overlayer.js'
import { textWalker } from './text-walker.js'

const SEARCH_PREFIX = 'foliate-search:'

const isZip = async file => {
    const arr = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    return arr[0] === 0x50 && arr[1] === 0x4b && arr[2] === 0x03 && arr[3] === 0x04
}

const zipLoaderCache = new WeakMap()
const utf8Decoder = new TextDecoder()
const SYNC_INFLATE_MAX_BYTES = 96 * 1024

const decompressRawDeflate = async compressed => {
    const ds = new DecompressionStream('deflate-raw')
    const writer = ds.writable.getWriter()
    const writePromise = writer.write(compressed).then(() => writer.close())
    const [buffer] = await Promise.all([new Response(ds.readable).arrayBuffer(), writePromise])
    return new Uint8Array(buffer)
}

// Fast in-memory ZIP parser for standard EPUB archives (STORED / DEFLATE), avoiding zip.js
// BlobReader chunk round-trips. Small entries (XHTML/CSS/OPF) inflate synchronously with fflate
// to avoid Stream/IPC setup overhead; large entries (images) use parallel native DecompressionStream.
// Falls back to zip.js for ZIP64, encrypted, or exotic entries.
const tryParseInMemoryZip = (bytes, inflateRawSync) => {
    const len = bytes.length
    if (len < 22) return null
    const view = new DataView(bytes.buffer, bytes.byteOffset, len)
    const minEocd = Math.max(0, len - 65557)
    let eocdOffset = -1
    for (let i = len - 22; i >= minEocd; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocdOffset = i
            break
        }
    }
    if (eocdOffset < 0) return null
    const entryCount = view.getUint16(eocdOffset + 10, true)
    const cdSize = view.getUint32(eocdOffset + 12, true)
    const cdOffset = view.getUint32(eocdOffset + 16, true)
    if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return null
    if (cdOffset + cdSize > len) return null

    const map = new Map()
    const entries = []
    let pos = cdOffset
    const cdEnd = cdOffset + cdSize
    for (let i = 0; i < entryCount && pos + 46 <= cdEnd; i++) {
        if (view.getUint32(pos, true) !== 0x02014b50) return null
        const flags = view.getUint16(pos + 8, true)
        const method = view.getUint16(pos + 10, true)
        // Encrypted entries or unsupported compression methods fall back to zip.js.
        if ((flags & 1) !== 0 || (method !== 0 && method !== 8)) return null
        const compressedSize = view.getUint32(pos + 20, true)
        const uncompressedSize = view.getUint32(pos + 24, true)
        const nameLen = view.getUint16(pos + 28, true)
        const extraLen = view.getUint16(pos + 30, true)
        const commentLen = view.getUint16(pos + 32, true)
        const localHeaderOffset = view.getUint32(pos + 42, true)
        if (
            compressedSize === 0xffffffff ||
            uncompressedSize === 0xffffffff ||
            localHeaderOffset === 0xffffffff
        ) return null
        const nameStart = pos + 46
        const extraStart = nameStart + nameLen
        const extraEnd = extraStart + extraLen
        if (extraEnd > cdEnd) return null
        // Fall back to zip.js when an Info-ZIP Unicode Path extra field (0x7075) is present
        // or a non-UTF-8 flag hides non-ASCII filename bytes.
        for (let extraPos = extraStart; extraPos + 4 <= extraEnd; ) {
            const headerId = view.getUint16(extraPos, true)
            const dataSize = view.getUint16(extraPos + 2, true)
            if (headerId === 0x7075) return null
            extraPos += 4 + dataSize
        }
        const filename = utf8Decoder.decode(bytes.subarray(nameStart, extraStart))
        pos = extraEnd + commentLen
        if (localHeaderOffset + 30 > len || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
            return null
        }
        const localNameLen = view.getUint16(localHeaderOffset + 26, true)
        const localExtraLen = view.getUint16(localHeaderOffset + 28, true)
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen
        const dataEnd = dataStart + compressedSize
        if (dataEnd > len) return null
        const entry = { filename, method, dataStart, dataEnd, uncompressedSize }
        map.set(filename, entry)
        entries.push(entry)
    }

    const decodedCache = new Map()
    const decodedInFlight = new Map()
    let cachedBytes = 0
    const maxCacheBytes = 24 * 1024 * 1024
    const rememberDecoded = (name, data) => {
        if (data.byteLength > maxCacheBytes / 2) return
        if (decodedCache.has(name)) {
            cachedBytes -= decodedCache.get(name).byteLength
            decodedCache.delete(name)
        }
        while (cachedBytes + data.byteLength > maxCacheBytes && decodedCache.size > 0) {
            const oldestKey = decodedCache.keys().next().value
            cachedBytes -= decodedCache.get(oldestKey).byteLength
            decodedCache.delete(oldestKey)
        }
        decodedCache.set(name, data)
        cachedBytes += data.byteLength
    }
    const inflateEntry = entry => {
        const compressed = bytes.subarray(entry.dataStart, entry.dataEnd)
        const preferSync =
            inflateRawSync &&
            (typeof DecompressionStream !== 'function' ||
                (entry.uncompressedSize > 0 && entry.uncompressedSize <= SYNC_INFLATE_MAX_BYTES))
        if (preferSync) {
            try {
                let decompressed
                if (entry.uncompressedSize > 0 && entry.uncompressedSize < 8 * 1024 * 1024) {
                    const out = new Uint8Array(entry.uncompressedSize + 1)
                    decompressed = inflateRawSync(compressed, out)
                    if (decompressed.byteLength > entry.uncompressedSize) {
                        decompressed = inflateRawSync(compressed)
                    }
                } else {
                    decompressed = inflateRawSync(compressed)
                }
                rememberDecoded(entry.filename, decompressed)
                return decompressed
            } catch {
                // Fall back to DecompressionStream if fflate rejects a stream.
            }
        }
        const pending = decodedInFlight.get(entry.filename)
        if (pending) return pending
        const promise = decompressRawDeflate(compressed)
            .then(decompressed => {
                rememberDecoded(entry.filename, decompressed)
                return decompressed
            })
            .finally(() => {
                if (decodedInFlight.get(entry.filename) === promise) {
                    decodedInFlight.delete(entry.filename)
                }
            })
        decodedInFlight.set(entry.filename, promise)
        return promise
    }
    const readBytes = entry => {
        if (entry.method === 0) return bytes.subarray(entry.dataStart, entry.dataEnd)
        const cached = decodedCache.get(entry.filename)
        if (cached) {
            decodedCache.delete(entry.filename)
            decodedCache.set(entry.filename, cached)
            return cached
        }
        return inflateEntry(entry)
    }
    const loadText = name => {
        const entry = map.get(name)
        if (!entry) return null
        const data = readBytes(entry)
        return data instanceof Promise
            ? data.then(buf => utf8Decoder.decode(buf))
            : utf8Decoder.decode(data)
    }
    const loadBlob = (name, type) => {
        const entry = map.get(name)
        if (!entry) return null
        const data = readBytes(entry)
        return data instanceof Promise
            ? data.then(buf => new Blob([buf], { type }))
            : new Blob([data], { type })
    }
    const getSize = name => map.get(name)?.uncompressedSize ?? 0
    return { entries, loadText, loadBlob, getSize }
}

const makeZipLoader = async file => {
    const cached = zipLoaderCache.get(file)
    if (cached) return cached
    const promise = (async () => {
        try {
            const [buffer, fflate] = await Promise.all([
                file.arrayBuffer(),
                import('./vendor/fflate.js').catch(() => null),
            ])
            const inflateRawSync = fflate?.inflateRawSync ?? null
            if (inflateRawSync || typeof DecompressionStream === 'function') {
                const fast = tryParseInMemoryZip(new Uint8Array(buffer), inflateRawSync)
                if (fast) return fast
            }
        } catch {
            // Fall back to zip.js for malformed or non-standard archives.
        }
        const { configure, ZipReader, BlobReader, TextWriter, BlobWriter } =
            await import('./vendor/zip.js')
        configure({ useWebWorkers: false, chunkSize: 1 << 20 })
        const reader = new ZipReader(new BlobReader(file))
        const entries = await reader.getEntries()
        const map = new Map(entries.map(entry => [entry.filename, entry]))
        const load = f => (name, ...args) =>
            map.has(name) ? f(map.get(name), ...args) : null
        const loadText = load(entry => entry.getData(new TextWriter()))
        const loadBlob = load((entry, type) => entry.getData(new BlobWriter(type)))
        const getSize = name => map.get(name)?.uncompressedSize ?? 0
        return { entries, loadText, loadBlob, getSize }
    })()
    zipLoaderCache.set(file, promise)
    return promise
}

const getFileEntries = async entry => entry.isFile ? entry
    : (await Promise.all(Array.from(
        await new Promise((resolve, reject) => entry.createReader()
            .readEntries(entries => resolve(entries), error => reject(error))),
        getFileEntries))).flat()

const makeDirectoryLoader = async entry => {
    const entries = await getFileEntries(entry)
    const files = await Promise.all(
        entries.map(entry => new Promise((resolve, reject) =>
            entry.file(file => resolve([file, entry.fullPath]),
                error => reject(error)))))
    const map = new Map(files.map(([file, path]) =>
        [path.replace(entry.fullPath + '/', ''), file]))
    const decoder = new TextDecoder()
    const decode = x => x ? decoder.decode(x) : null
    const getBuffer = name => map.get(name)?.arrayBuffer() ?? null
    const loadText = async name => decode(await getBuffer(name))
    const loadBlob = name => map.get(name)
    const getSize = name => map.get(name)?.size ?? 0
    return { loadText, loadBlob, getSize }
}

export class ResponseError extends Error {}
export class NotFoundError extends Error {}
export class UnsupportedTypeError extends Error {}

const fetchFile = async url => {
    const res = await fetch(url)
    if (!res.ok) throw new ResponseError(
        `${res.status} ${res.statusText}`, { cause: res })
    return new File([await res.blob()], new URL(res.url).pathname)
}

export const makeBook = async file => {
    if (typeof file === 'string') file = await fetchFile(file)
    let book
    if (file.isDirectory) {
        const loader = await makeDirectoryLoader(file)
        const { EPUB } = await import('./epub.js')
        book = await new EPUB(loader).init()
    }
    else if (!file.size) throw new NotFoundError('File not found')
    else if (await isZip(file)) {
        const loader = await makeZipLoader(file)
        const { EPUB } = await import('./epub.js')
        book = await new EPUB(loader).init()
    }
    else {
        const { isMOBI, MOBI } = await import('./mobi.js')
        if (await isMOBI(file)) {
            const fflate = await import('./vendor/fflate.js')
            book = await new MOBI({ unzlib: fflate.unzlibSync }).open(file)
        }
    }
    if (!book) throw new UnsupportedTypeError('File type not supported')
    return book
}

class CursorAutohider {
    #timeout
    #el
    #check
    #state
    constructor(el, check, state = {}) {
        this.#el = el
        this.#check = check
        this.#state = state
        if (this.#state.hidden) this.hide()
        this.#el.addEventListener('mousemove', ({ screenX, screenY }) => {
            // check if it actually moved
            if (screenX === this.#state.x && screenY === this.#state.y) return
            this.#state.x = screenX, this.#state.y = screenY
            this.show()
            if (this.#timeout) clearTimeout(this.#timeout)
            if (check()) this.#timeout = setTimeout(this.hide.bind(this), 1000)
        }, false)
    }
    cloneFor(el) {
        return new CursorAutohider(el, this.#check, this.#state)
    }
    hide() {
        this.#el.style.cursor = 'none'
        this.#state.hidden = true
    }
    show() {
        this.#el.style.removeProperty('cursor')
        this.#state.hidden = false
    }
}

class History extends EventTarget {
    #arr = []
    #index = -1
    pushState(x) {
        const last = this.#arr[this.#index]
        if (last === x || last?.fraction && last.fraction === x.fraction) return
        this.#arr[++this.#index] = x
        this.#arr.length = this.#index + 1
        this.dispatchEvent(new Event('index-change'))
    }
    replaceState(x) {
        const index = this.#index
        this.#arr[index] = x
    }
    back() {
        const index = this.#index
        if (index <= 0) return
        const detail = { state: this.#arr[index - 1] }
        this.#index = index - 1
        this.dispatchEvent(new CustomEvent('popstate', { detail }))
        this.dispatchEvent(new Event('index-change'))
    }
    forward() {
        const index = this.#index
        if (index >= this.#arr.length - 1) return
        const detail = { state: this.#arr[index + 1] }
        this.#index = index + 1
        this.dispatchEvent(new CustomEvent('popstate', { detail }))
        this.dispatchEvent(new Event('index-change'))
    }
    get canGoBack() {
        return this.#index > 0
    }
    get canGoForward() {
        return this.#index < this.#arr.length - 1
    }
    clear() {
        this.#arr = []
        this.#index = -1
    }
}

const languageInfo = lang => {
    if (!lang) return {}
    try {
        const canonical = Intl.getCanonicalLocales(lang)[0]
        const locale = new Intl.Locale(canonical)
        const isCJK = ['zh', 'ja', 'kr'].includes(locale.language)
        const direction = (locale.getTextInfo?.() ?? locale.textInfo)?.direction
        return { canonical, locale, isCJK, direction }
    } catch (e) {
        console.warn(e)
        return {}
    }
}

export class View extends HTMLElement {
    #root = this.attachShadow({ mode: 'closed' })
    #sectionProgress
    #tocProgress
    #pageProgress
    #searchResults = new Map()
    #searchDraw
    #searchDrawOptions
    #cursorAutohider = new CursorAutohider(this, () =>
        this.hasAttribute('autohide-cursor'))
    isFixedLayout = false
    lastLocation
    history = new History()
    constructor() {
        super()
        this.history.addEventListener('popstate', ({ detail }) => {
            const resolved = this.resolveNavigation(detail.state)
            this.renderer.goTo(resolved)
        })
    }
    async open(book) {
        if (typeof book === 'string'
        || typeof book.arrayBuffer === 'function'
        || book.isDirectory) book = await makeBook(book)
        this.book = book
        this.language = languageInfo(book.metadata?.language)

        if (book.splitTOCHref && book.getTOCFragment) {
            const ids = book.sections.map(s => s.id)
            this.#sectionProgress = new SectionProgress(book.sections, 1500, 1600)
            const splitHref = book.splitTOCHref.bind(book)
            const getFragment = book.getTOCFragment.bind(book)
            this.#tocProgress = new TOCProgress()
            await this.#tocProgress.init({
                toc: book.toc ?? [], ids, splitHref, getFragment })
            this.#pageProgress = new TOCProgress()
            await this.#pageProgress.init({
                toc: book.pageList ?? [], ids, splitHref, getFragment })
        }

        this.isFixedLayout = this.book.rendition?.layout === 'pre-paginated'
        if (this.isFixedLayout) {
            await import('./fixed-layout.js')
            this.renderer = document.createElement('foliate-fxl')
        } else {
            await import('./paginator.js')
            this.renderer = document.createElement('foliate-paginator')
        }
        this.renderer.setAttribute('exportparts', 'head,foot,filter')
        this.renderer.addEventListener('load', e => this.#onLoad(e.detail))
        this.renderer.addEventListener('relocate', e => this.#onRelocate(e.detail))
        this.renderer.addEventListener('create-overlayer', e =>
            e.detail.attach(this.#createOverlayer(e.detail)))
        this.renderer.addEventListener('page-turn-start', e =>
            this.#emit('page-turn-start', e.detail))
        this.renderer.addEventListener('section-load-timing', e =>
            this.#emit('section-load-timing', e.detail))
        this.renderer.open(book)
        this.#root.append(this.renderer)

        if (book.sections.some(section => section.mediaOverlay)) {
            const activeClass = book.media.activeClass
            const playbackActiveClass = book.media.playbackActiveClass
            this.mediaOverlay = book.getMediaOverlay()
            let lastActive
            this.mediaOverlay.addEventListener('highlight', e => {
                const resolved = this.resolveNavigation(e.detail.text)
                this.renderer.goTo(resolved)
                    .then(() => {
                        const { doc } = this.renderer.getContents()
                            .find(x => x.index = resolved.index)
                        const el = resolved.anchor(doc)
                        el.classList.add(activeClass)
                        if (playbackActiveClass) el.ownerDocument
                            .documentElement.classList.add(playbackActiveClass)
                        lastActive = new WeakRef(el)
                    })
            })
            this.mediaOverlay.addEventListener('unhighlight', () => {
                const el = lastActive?.deref()
                if (el) {
                    el.classList.remove(activeClass)
                    if (playbackActiveClass) el.ownerDocument
                        .documentElement.classList.remove(playbackActiveClass)
                }
            })
        }
    }
    close() {
        this.renderer?.destroy()
        this.renderer?.remove()
        this.#sectionProgress = null
        this.#tocProgress = null
        this.#pageProgress = null
        this.#searchResults = new Map()
        this.lastLocation = null
        this.history.clear()
        this.tts = null
        this.mediaOverlay = null
    }
    goToTextStart() {
        return this.goTo(this.book.landmarks
            ?.find(m => m.type.includes('bodymatter') || m.type.includes('text'))
            ?.href ?? this.book.sections.findIndex(s => s.linear !== 'no'))
    }
    async init({ lastLocation, showTextStart }) {
        const resolved = lastLocation ? this.resolveNavigation(lastLocation) : null
        if (resolved) {
            await this.renderer.goTo(resolved)
            this.history.pushState(lastLocation)
        }
        else if (showTextStart) await this.goToTextStart()
        else {
            this.history.pushState(0)
            await this.next()
        }
    }
    #emit(name, detail, cancelable) {
        return this.dispatchEvent(new CustomEvent(name, { detail, cancelable }))
    }
    #onRelocate({ reason, range, index, fraction, size }) {
        const progress = this.#sectionProgress?.getProgress(index, fraction, size) ?? {}
        const tocItem = this.#tocProgress?.getProgress(index, range)
        const pageItem = this.#pageProgress?.getProgress(index, range)
        const cfi = this.getCFI(index, range)
        this.lastLocation = { ...progress, tocItem, pageItem, cfi, range }
        if (reason === 'snap' || reason === 'page' || reason === 'scroll')
            this.history.replaceState(cfi)
        this.#emit('relocate', this.lastLocation)
    }
    #onLoad({ doc, index }) {
        // set language and dir if not already set
        doc.documentElement.lang ||= this.language.canonical ?? ''
        if (!this.language.isCJK)
            doc.documentElement.dir ||= this.language.direction ?? ''

        this.#handleLinks(doc, index)
        this.#cursorAutohider.cloneFor(doc.documentElement)

        this.#emit('load', { doc, index })
    }
    #handleLinks(doc, index) {
        const { book } = this
        const section = book.sections[index]
        doc.addEventListener('click', e => {
            const a = e.target.closest('a[href]')
            if (!a) return
            e.preventDefault()
            const href_ = a.getAttribute('href')
            const href = section?.resolveHref?.(href_) ?? href_
            if (book?.isExternal?.(href))
                Promise.resolve(this.#emit('external-link', { a, href_ }, true))
                    .then(x => x ? globalThis.open(href_, '_blank') : null)
                    .catch(e => console.error(e))
            else Promise.resolve(this.#emit('link', { a, href }, true))
                .then(x => x ? this.goTo(href) : null)
                .catch(e => console.error(e))
        })
    }
    async addAnnotation(annotation, remove) {
        const { value } = annotation
        if (value.startsWith(SEARCH_PREFIX)) {
            const cfi = value.replace(SEARCH_PREFIX, '')
            const { index, anchor } = await this.resolveNavigation(cfi)
            const obj = this.#getOverlayer(index)
            if (obj) {
                const { overlayer, doc } = obj
                if (remove) {
                    overlayer.remove(value)
                    return
                }
                const range = doc ? anchor(doc) : anchor
                overlayer.add(value, range, this.#searchDraw, this.#searchDrawOptions)
            }
            return
        }
        const { index, anchor } = await this.resolveNavigation(value)
        const obj = this.#getOverlayer(index)
        if (obj) {
            const { overlayer, doc } = obj
            overlayer.remove(value)
            if (!remove) {
                const range = doc ? anchor(doc) : anchor
                const draw = (func, opts) => overlayer.add(value, range, func, opts)
                this.#emit('draw-annotation', { draw, annotation, doc, range })
            }
        }
        const label = this.#tocProgress.getProgress(index)?.label ?? ''
        return { index, label }
    }
    deleteAnnotation(annotation) {
        return this.addAnnotation(annotation, true)
    }
    #getOverlayer(index) {
        return this.renderer.getContents()
            .find(x => x.index === index && x.overlayer)
    }
    #createOverlayer({ doc, index }) {
        const overlayer = new Overlayer()
        doc.addEventListener('click', e => {
            const [value, range] = overlayer.hitTest(e)
            if (value && !value.startsWith(SEARCH_PREFIX)) {
                this.#emit('show-annotation', { value, index, range })
            }
        }, false)

        const list = this.#searchResults.get(index)
        if (list) for (const item of list) this.addAnnotation(item)

        this.#emit('create-overlay', { index })
        return overlayer
    }
    async showAnnotation(annotation) {
        const { value } = annotation
        const resolved = await this.goTo(value)
        if (resolved) {
            const { index, anchor } = resolved
            const { doc } =  this.#getOverlayer(index)
            const range = anchor(doc)
            this.#emit('show-annotation', { value, index, range })
        }
    }
    getCFI(index, range) {
        const baseCFI = this.book.sections[index].cfi ?? CFI.fake.fromIndex(index)
        if (!range) return baseCFI
        return CFI.joinIndir(baseCFI, CFI.fromRange(range))
    }
    resolveCFI(cfi) {
        if (this.book.resolveCFI)
            return this.book.resolveCFI(cfi)
        else {
            const parts = CFI.parse(cfi)
            const index = CFI.fake.toIndex((parts.parent ?? parts).shift())
            const anchor = doc => CFI.toRange(doc, parts)
            return { index, anchor }
        }
    }
    resolveNavigation(target) {
        try {
            if (typeof target === 'number') return { index: target }
            if (typeof target.fraction === 'number') {
                const [index, anchor] = this.#sectionProgress.getSection(target.fraction)
                return { index, anchor }
            }
            if (CFI.isCFI.test(target)) return this.resolveCFI(target)
            return this.book.resolveHref(target)
        } catch (e) {
            console.error(e)
            console.error(`Could not resolve target ${target}`)
        }
    }
    async goTo(target) {
        const resolved = this.resolveNavigation(target)
        try {
            await this.renderer.goTo(resolved)
            this.history.pushState(target)
            return resolved
        } catch(e) {
            console.error(e)
            console.error(`Could not go to ${target}`)
        }
    }
    async goToFraction(frac) {
        const [index, anchor] = this.#sectionProgress.getSection(frac)
        await this.renderer.goTo({ index, anchor })
        this.history.pushState({ fraction: frac })
    }
    async select(target) {
        try {
            const obj = await this.resolveNavigation(target)
            await this.renderer.goTo({ ...obj, select: true })
            this.history.pushState(target)
        } catch(e) {
            console.error(e)
            console.error(`Could not go to ${target}`)
        }
    }
    deselect() {
        for (const { doc } of this.renderer.getContents())
            doc.defaultView.getSelection().removeAllRanges()
    }
    getSectionFractions() {
        return (this.#sectionProgress?.sectionFractions ?? [])
            .map(x => x + Number.EPSILON)
    }
    getPageInfo() {
        return this.renderer?.getPageInfo?.() ?? null
    }
    getProgressOf(index, range) {
        const tocItem = this.#tocProgress?.getProgress(index, range)
        const pageItem = this.#pageProgress?.getProgress(index, range)
        return { tocItem, pageItem }
    }
    async getTOCItemOf(target) {
        try {
            const { index, anchor } = await this.resolveNavigation(target)
            const doc = await this.book.sections[index].createDocument()
            const frag = anchor(doc)
            const isRange = frag instanceof Range
            const range = isRange ? frag : doc.createRange()
            if (!isRange) range.selectNodeContents(frag)
            return this.#tocProgress.getProgress(index, range)
        } catch(e) {
            console.error(e)
            console.error(`Could not get ${target}`)
        }
    }
    async prev(distance) {
        await this.renderer.prev(distance)
    }
    async next(distance) {
        await this.renderer.next(distance)
    }
    goLeft() {
        return this.book.dir === 'rtl' ? this.next() : this.prev()
    }
    goRight() {
        return this.book.dir === 'rtl' ? this.prev() : this.next()
    }
    async * #searchSection(matcher, query, index) {
        const doc = await this.book.sections[index].createDocument()
        for (const { range, excerpt } of matcher(doc, query))
            yield { cfi: this.getCFI(index, range), excerpt }
    }
    async * #searchBook(matcher, query) {
        const { sections } = this.book
        for (const [index, { createDocument }] of sections.entries()) {
            if (!createDocument) continue
            const doc = await createDocument()
            const subitems = Array.from(matcher(doc, query), ({ range, excerpt }) =>
                ({ cfi: this.getCFI(index, range), excerpt }))
            const progress = (index + 1) / sections.length
            yield { progress }
            if (subitems.length) yield { index, subitems }
        }
    }
    async * search(opts) {
        this.clearSearch()
        this.#searchDraw = opts.draw ?? Overlayer.outline
        this.#searchDrawOptions = opts.drawOptions
        const { searchMatcher } = await import('./search.js')
        const { query, index } = opts
        const matcher = searchMatcher(textWalker,
            { defaultLocale: this.language, ...opts })
        const iter = index != null
            ? this.#searchSection(matcher, query, index)
            : this.#searchBook(matcher, query)

        const list = []
        this.#searchResults.set(index, list)

        for await (const result of iter) {
            if (result.subitems){
                const list = result.subitems
                    .map(({ cfi }) => ({ value: SEARCH_PREFIX + cfi }))
                this.#searchResults.set(result.index, list)
                for (const item of list) this.addAnnotation(item)
                yield {
                    label: this.#tocProgress.getProgress(result.index)?.label ?? '',
                    subitems: result.subitems,
                }
            }
            else {
                if (result.cfi) {
                    const item = { value: SEARCH_PREFIX + result.cfi }
                    list.push(item)
                    this.addAnnotation(item)
                }
                yield result
            }
        }
        yield 'done'
    }
    clearSearch() {
        for (const list of this.#searchResults.values())
            for (const item of list) this.deleteAnnotation(item)
        this.#searchResults.clear()
    }
    async initTTS(granularity = 'word', highlight) {
        const doc = this.renderer.getContents()[0].doc
        if (this.tts && this.tts.doc === doc) return
        const { TTS } = await import('./tts.js')
        this.tts = new TTS(doc, textWalker, highlight || (range =>
            this.renderer.scrollToAnchor(range, true)), granularity)
    }
    startMediaOverlay() {
        const { index } = this.renderer.getContents()[0]
        return this.mediaOverlay.start(index)
    }
}

customElements.define('foliate-view', View)
