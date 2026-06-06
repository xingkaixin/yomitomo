export function EmptyNotes({
  labels = {
    emptyNotesDescription: '选中阅读器内的文本后，可以写下想法。高亮和讨论会保存在当前文章下。',
    emptyNotesTitle: '选择一段文字记录想法',
  },
}: {
  labels?: { emptyNotesDescription: string; emptyNotesTitle: string };
}) {
  return (
    <div className="reader-empty">
      <strong>{labels.emptyNotesTitle}</strong>
      <p>{labels.emptyNotesDescription}</p>
    </div>
  );
}
