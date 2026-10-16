export type AssistantReference =
  | { kind: 'passage'; start: number; end: number }
  | { kind: 'discussion'; annotationId: string };

// Agent replies point at the article text and at annotation discussions through in-app fragment
// links; main writes them when it saves a reply, and readers open them on click.
export function assistantReferenceHref(reference: AssistantReference) {
  return reference.kind === 'passage'
    ? `#passage:${reference.start}-${reference.end}`
    : `#discussion:${reference.annotationId}`;
}

export function parseAssistantReference(href: string): AssistantReference | undefined {
  const passage = /^#passage:(\d+)-(\d+)$/.exec(href);
  if (passage) {
    const start = Number(passage[1]);
    const end = Number(passage[2]);
    return end > start ? { kind: 'passage', start, end } : undefined;
  }
  const discussion = /^#discussion:([\w-]+)$/.exec(href);
  return discussion ? { kind: 'discussion', annotationId: discussion[1]! } : undefined;
}
