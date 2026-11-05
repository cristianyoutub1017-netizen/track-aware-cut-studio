<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AutoCut editor logic lives in `src/lib/autocut/` as pure functions (core, subtitles, vegas export) with UI in `src/components/autocut/`; keeps the Vegas .cs generator testable and portable to a future Electron build.
- Analysis is one Electron IPC call (`project:analyze` in electron/main.cjs): ffprobe detects audio streams, one ffmpeg pass splits up to 4 tracks to WAV + measures levels, then `public/autocut_analizar.py` transcribes the WAVs into a temp file; no user-facing JSON import, so the workflow stays one click.
