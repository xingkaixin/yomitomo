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
The user or agent identity attached to an Annotation, Comment, or assistant review message. Domain
objects represent it as a discriminated author reference; persistence details such as `agent` and
`ai` labels are translated at the repository boundary.
_Avoid_: author role plus parallel user and agent identity fields; `ai` plus copied agent fields

**Reading Progress**:
The source-specific facts needed to restore an Article's reading position. Web and text sources
store scroll progress, PDFs store page position, and ebooks store a chapter anchor plus the
independent whole-book progress reported by the reader. Presentation code derives a common ratio
through `readingProgressRatio`.
_Avoid_: one universal record padded with synthetic or redundant fields

**Reading Activity**:
The dated events behind reading stats and the activity heatmap. Annotations, thoughts, discussion
comments and AI contributions count on the local day they were created; published distillations
count on their publish day. An Article counts as read on the day of its `updatedAt`, which also
moves when only reading progress or reader chat state is saved.
_Avoid_: attributing an Article's historical annotation counts to its `updatedAt`

**Article Translation**:
A source-bound translation of an Article for one target language and prompt version. Its source
content identity determines whether an existing translation can be reused; it does not replace the
Article's original content.
_Avoid_: mutating Article content; one global translation cache

**Library Catalog Item**:
An Article or WeRead Book hydrated for the mixed library catalog. Its source discriminant owns one
required payload; content references and filter types are derived from that payload.
_Avoid_: Library Item Entity; parallel ref, type, and optional payload discriminators

# Assistant Execution

**Assistant Runtime Task**:
One of the workflows recorded by the retired tool-loop runtime: thread reply, thought creation,
distillation review, selection-first annotation, or co-reading section annotation. New replies run
in an Assistant Session instead.
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

# Assistant Sessions

**Assistant Session**:
The pi-durable conversation one agent keeps for one Article. It is a rebuildable cache next to the
main database, not a source of truth, and it is not part of a full backup.
_Avoid_: thread session; per-channel session

**Channel**:
A place where readers and agents exchange messages: an annotation thread, the top-level thoughts of
an annotation, or one 问一问 session. Its messages live in the main database; agents only read
deliveries and write replies back.
_Avoid_: treating the Assistant Session as the channel's history

**Delivery**:
The channel messages an agent has not seen yet, appended to its Assistant Session together with the
request to reply. Deleted messages arrive later as retraction notes instead of being removed.
_Avoid_: resending the whole channel

**Assistant Run**:
One agent working on one or more deliveries in a fork of its Assistant Session. It ends with a reply
written back to the channel or with a failure; closing a window does not stop it.
_Avoid_: request; stream
