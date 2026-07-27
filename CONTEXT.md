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

# Assistant Execution

**Assistant Runtime Task**:
One of the tool-loop workflows supported by the assistant runtime: thread reply, thought creation,
distillation review, selection-first annotation, or co-reading section annotation.
_Avoid_: Agent Runtime Trace Task

**Assistant Execution Task**:
The persisted kind of an AI invocation. It includes direct annotation generation as well as every
Assistant Runtime Task; direct annotation generation is not itself a tool-loop task.
_Avoid_: treating every execution as an Assistant Runtime Task

**Runtime Result**:
Whether an attempted tool-loop runtime produced a final action or fell back. It does not describe
whether a generated annotation was retained.
_Avoid_: comment; result; kept without runtime

**Annotation Retention Decision**:
Whether an annotation candidate was kept or filtered. Runtime Result is recorded independently and
may be absent when no runtime was attempted.
_Avoid_: encoding retention in Runtime Result

**Assistant Execution Status**:
Whether a persisted AI invocation succeeded, used a fallback path, or ended in error. It summarizes
the whole invocation rather than the narrower tool-loop Runtime Result.
