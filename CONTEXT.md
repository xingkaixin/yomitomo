# Yomitomo Reading Library

The reading library brings locally owned reading material and remotely synchronized books into
one catalog while preserving their different identities.

## Language

**Article**:
A locally owned reading item whose source is a web page, ebook, PDF, or text document. A WeRead
Book is not an Article.
_Avoid_: WeRead Article

**WeRead Book**:
A remotely synchronized WeRead reading item that sits alongside Articles in the library catalog
and collections.
_Avoid_: Article

**Annotation Author**:
The user or agent identity attached to an Annotation or Comment. Domain objects represent it as a
discriminated author reference; the separate user and agent columns in SQLite are persistence
details translated at the repository boundary.
_Avoid_: author role plus parallel user and agent identity fields

**Reading Progress**:
The source-specific facts needed to restore an Article's reading position. Web and text sources
store scroll progress, PDFs store page position, and ebooks store a chapter anchor plus the
independent whole-book progress reported by the reader. Presentation code derives a common ratio
through `readingProgressRatio`.
_Avoid_: one universal record padded with synthetic or redundant fields

**Library Catalog Item**:
An Article or WeRead Book hydrated for the mixed library catalog. Its source discriminant owns one
required payload; content references and filter types are derived from that payload.
_Avoid_: Library Item Entity; parallel ref, type, and optional payload discriminators
