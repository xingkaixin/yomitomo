import lanmoSketchWorkletUrl from './lanmo-sketch-worklet?worker&url';

type PaintWorkletCss = { paintWorklet?: { addModule(url: string): Promise<void> } };

export function registerLanmoSketch(root: HTMLElement) {
  if (root.dataset.sketch) return;
  const css = root.ownerDocument.defaultView?.CSS as PaintWorkletCss | undefined;
  if (!css?.paintWorklet) return;

  root.dataset.sketch = 'loading';
  css.paintWorklet.addModule(lanmoSketchWorkletUrl).then(
    () => {
      root.dataset.sketch = 'ready';
    },
    () => {
      // lanmo.css only draws once this reports ready; the theme keeps its plain borders otherwise.
    },
  );
}
