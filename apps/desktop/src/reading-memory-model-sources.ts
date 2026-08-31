const modelId = 'onnx-community/embeddinggemma-300m-ONNX';

export const readingMemoryModelSources = {
  modelscope: {
    name: 'ModelScope',
    url: `https://modelscope.cn/models/${modelId}`,
    revision: '8a5a38f48e040757f2ccca1782d11c4279e0a34b',
  },
  huggingface: {
    name: 'Hugging Face',
    url: `https://huggingface.co/${modelId}`,
    revision: '5090578d9565bb06545b4552f76e6bc2c93e4a66',
  },
} as const;

export type ReadingMemoryModelSource = keyof typeof readingMemoryModelSources;

export function readingMemoryModelFileUrl(path: string, source: ReadingMemoryModelSource) {
  const { revision } = readingMemoryModelSources[source];
  if (source === 'modelscope') {
    return `https://modelscope.cn/api/v1/models/${modelId}/repo?Revision=${revision}&FilePath=${encodeURIComponent(path)}`;
  }
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `https://huggingface.co/${modelId}/resolve/${revision}/${encodedPath}`;
}
