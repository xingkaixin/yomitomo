import type { AgentAnnotationDensity } from '@yomitomo/shared';

export function annotationDensityInstruction(density: AgentAnnotationDensity, sourceText = '') {
  const max = annotationDensityMax(density, sourceText);
  if (density === 'low')
    return `克制，本次最多 ${max} 条，只选择能明显改变理解的片段；内容普通时可以返回空数组。`;
  if (density === 'high')
    return `积极，本次最多 ${max} 条，覆盖多个值得讨论的片段；短文仍保持克制。`;
  return `标准，本次最多 ${max} 条，优先保留少量高价值批注；内容普通时可以返回空数组。`;
}

export function annotationDensityMax(density: AgentAnnotationDensity, sourceText = '') {
  const size = annotationSourceSize(sourceText);
  if (size <= 280) return density === 'high' ? 2 : 1;
  if (size <= 800) return density === 'low' ? 1 : density === 'high' ? 3 : 2;
  if (size <= 2000) return density === 'low' ? 2 : density === 'high' ? 5 : 3;
  return density === 'low' ? 3 : density === 'high' ? 8 : 5;
}

function annotationSourceSize(sourceText: string) {
  return sourceText.replace(/\s+/g, '').length;
}
