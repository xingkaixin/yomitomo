import concurrent.futures
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess

assets = Path(__file__).resolve().parent
root = assets.parents[4]
source = Path('/Users/Kevin/Dropbox/OBSIDIAN/XingKaiXin/00_Inbox/2026/2026-11/aie_code_summit_2026_video_summaries.md')
env = {**os.environ, 'CI': '1', 'NO_COLOR': '1'}
commands = [
    ('lint-invalid-import', ['pnpm', 'exec', 'oxlint', '--no-ignore', '-c', '.oxlintrc.json', str(assets / 'lint-probes/invalid-hook.tsx')], 1),
    ('lint-invalid-property', ['pnpm', 'exec', 'oxlint', '--no-ignore', '-c', '.oxlintrc.json', str(assets / 'lint-probes/invalid-property.tsx')], 1),
    ('lint-valid-control', ['pnpm', 'exec', 'oxlint', '--no-ignore', '-c', '.oxlintrc.json', str(assets / 'lint-probes/valid-reducer.tsx')], 0),
    ('core-contracts', ['pnpm', '--filter', '@yomitomo/core', 'exec', 'vitest', 'run', 'src/articles/article-text-index.test.ts', 'src/reading-memory/reading-judgment-validation.test.ts'], 0),
    ('ai-contracts', ['pnpm', '--filter', '@yomitomo/ai', 'exec', 'vitest', 'run', 'src/reading-memory/reading-judgment.test.ts', 'src/reading-memory/reading-judgment-input.test.ts', 'src/evaluation/reading-memory-human-review-evaluation.test.js', 'src/evaluation/reading-memory-human-retrieval-evaluation.test.js'], 0),
    ('desktop-results', ['pnpm', '--filter', '@yomitomo/desktop', 'exec', 'vitest', 'run', 'src/main/assistant-sessions/assistant-run-transcript.test.ts', 'src/main/assistant-sessions/assistant-session-store.test.ts', 'src/main/assistant-sessions/assistant-distillation-review.test.ts', 'src/main/reading-memory/reading-library-runtime.test.ts', 'src/main/reading-memory/reading-relations-runtime.test.ts'], 0),
]

def run(command):
    name, args, expected = command
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(args, cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    (assets / f'{name}.txt').write_text(result.stdout)
    return {'id': name, 'args': args, 'cwd': str(root), 'startedAt': started, 'exitCode': result.returncode, 'expectedExitCode': expected, 'matchedExpectation': result.returncode == expected, 'output': f'{name}.txt'}

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(run, commands))

manifest = {
    'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'sourcePath': str(source),
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'scope': 'Targeted engineering verification; no human semantic quality or performance claim',
    'results': results,
}
(assets / 'verification-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
for result in results:
    print(json.dumps(result, ensure_ascii=False))
raise SystemExit(0 if all(result['matchedExpectation'] for result in results) else 1)
