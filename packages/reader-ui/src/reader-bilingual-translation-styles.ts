export const readerBilingualTranslationStyles = `
.reader-bilingual-translation {
  margin: -.2em 0 1.14em;
  color: color-mix(in srgb,var(--reader-ink) 76%,var(--reader-muted));
  font-family: var(--font-ui, ui-sans-serif, system-ui, sans-serif);
  font-size: .9em;
  line-height: 1.72;
}

.reader-bilingual-translation[data-reader-translation-style="dashedLine"] {
  text-decoration: underline dashed color-mix(in srgb,var(--reader-green) 72%,transparent);
  text-underline-offset: 5px;
}

.reader-bilingual-translation[data-reader-translation-style="blur"] {
  filter: blur(4px);
  opacity: .75;
  transition: filter .12s ease,opacity .12s ease;
}

.reader-bilingual-translation[data-reader-translation-style="blur"]:hover {
  filter: blur(0);
  opacity: 1;
}

.reader-bilingual-translation[data-reader-translation-style="blockquote"] {
  padding: .42em 0 .46em .9em;
  border-left: 3px solid color-mix(in srgb,var(--reader-green) 68%,transparent);
}

.reader-bilingual-translation[data-reader-translation-style="weakened"] {
  color: var(--reader-muted);
}

.reader-bilingual-translation[data-reader-translation-style="border"] {
  display: inline-block;
  padding: .18em .42em;
  border: 1px solid color-mix(in srgb,var(--reader-green) 45%,transparent);
  border-radius: 6px;
}

.reader-bilingual-translation.is-translating,.reader-bilingual-translation.is-failed {
  min-height: 1.8em;
}

.reader-bilingual-translation-loading,.reader-bilingual-translation-retry {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb,var(--reader-green) 9%,transparent);
  color: var(--reader-green);
  vertical-align: middle;
}

.reader-bilingual-translation-retry {
  cursor: pointer;
}

.reader-bilingual-translation-retry:hover {
  background: color-mix(in srgb,var(--reader-red) 10%,transparent);
  color: var(--reader-red);
}

.reader-bilingual-translation-indicator {
  display: inline-flex;
  width: 1.35em;
  height: 1.35em;
  align-items: center;
  justify-content: center;
  margin-left: .34em;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb,var(--reader-green) 9%,transparent);
  color: var(--reader-green);
  font: inherit;
  line-height: 1;
  vertical-align: -.18em;
}

.reader-bilingual-translation-indicator.is-failed {
  cursor: pointer;
  background: color-mix(in srgb,var(--reader-red) 10%,transparent);
  color: var(--reader-red);
}

.reader-bilingual-translation-indicator.is-failed:hover {
  background: color-mix(in srgb,var(--reader-red) 18%,transparent);
}

.reader-bilingual-translation-indicator.is-success {
  background: color-mix(in srgb,var(--reader-green) 14%,transparent);
}

.reader-bilingual-translation-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb,currentColor 20%,transparent);
  border-top-color: currentColor;
  border-radius: 999px;
  animation: reader-translation-spin .8s linear infinite;
}

.reader-bilingual-translation-check {
  position: relative;
  width: .72em;
  height: .72em;
  transform: rotate(45deg) translate(-.04em,-.04em);
}

.reader-bilingual-translation-check::after {
  content: "";
  position: absolute;
  left: .18em;
  top: -.02em;
  width: .28em;
  height: .62em;
  border: solid currentColor;
  border-width: 0 2px 2px 0;
  border-radius: 1px;
}

.reader-bilingual-translation-skeleton {
  display: grid;
  gap: .42em;
  width: min(92%,34rem);
  padding: .18em 0 .22em;
}

.reader-bilingual-translation-skeleton-line {
  display: block;
  height: .7em;
  overflow: hidden;
  border-radius: 999px;
  background: linear-gradient(90deg,color-mix(in srgb,var(--reader-muted) 10%,transparent),color-mix(in srgb,var(--reader-muted) 18%,transparent),color-mix(in srgb,var(--reader-muted) 10%,transparent));
  background-size: 220% 100%;
  animation: reader-translation-skeleton 1.15s ease-in-out infinite;
}

.reader-bilingual-translation-skeleton-line.is-last {
  width: 62%;
}

@keyframes reader-translation-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes reader-translation-skeleton {
  0% {
    background-position: 120% 0;
  }

  100% {
    background-position: -120% 0;
  }
}

@media(prefers-reduced-motion:reduce) {
  .reader-bilingual-translation[data-reader-translation-style="blur"] {
    transition: none;
  }

  .reader-bilingual-translation-spinner,.reader-bilingual-translation-skeleton-line {
    animation: none;
  }
}
`;
