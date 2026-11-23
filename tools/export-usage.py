"""Export only Codex's reported token counters from one local chat."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import UUID


ROOT = Path(__file__).resolve().parents[1]
BINDING = ROOT / ".usage-local" / "development-thread.txt"
DEVELOPMENT = ROOT / "evidence" / "development"
FIELDS = (
    "input_tokens", "cached_input_tokens", "cache_write_input_tokens",
    "output_tokens", "reasoning_output_tokens", "total_tokens",
)


def thread_id(value: str) -> str:
    try:
        return str(UUID(value.strip()))
    except ValueError as exc:
        raise ValueError("Нужен действительный UUID чата Codex.") from exc


def find_session(ident: str) -> Path:
    home = Path(os.environ.get("CODEX_HOME") or "~/.codex").expanduser()
    matches = set()
    for name in ("sessions", "archived_sessions"):
        folder = home / name
        if folder.is_dir():
            matches.update(p.resolve() for p in folder.rglob(f"*-{ident}.jsonl"))
    if len(matches) != 1:
        raise ValueError(f"Ожидался один локальный журнал этого чата. Найдено: {len(matches)}.")
    return matches.pop()


def counters(value: object) -> dict:
    if not isinstance(value, dict):
        raise ValueError("В записи Codex отсутствуют счётчики.")
    result = {k: value[k] for k in FIELDS if k in value}
    if not {"input_tokens", "output_tokens", "total_tokens"} <= result.keys():
        raise ValueError("Запись Codex не содержит полного набора основных счётчиков.")
    if any(type(n) is not int or n < 0 for n in result.values()):
        raise ValueError("Некорректный счётчик в журнале Codex.")
    return result


def read_usage(path: Path, ident: str) -> tuple:
    responses, snapshots = [], []
    seen, turns = {}, {}
    with path.open("rb") as stream:
        for line in stream:
            if b'"token_usage_record"' not in line and b'"token_count"' not in line:
                continue
            try:
                event = json.loads(line)
            except ValueError:
                if not line.endswith(b"\n"):
                    continue  # A writer can still be finishing this line.
                raise
            data = event.get("payload") or {}
            if event.get("type") == "token_usage_record" and data.get("thread_id") == ident:
                usage = counters(data.get("usage"))
                total = counters(data.get("thread_token_usage"))
                key = data.get("response_id")
                if not key:
                    raise ValueError("Нет идентификатора ответа для исключения дублей.")
                if key in seen:
                    if seen[key] != usage:
                        raise ValueError("У одного ответа обнаружены разные показания.")
                    continue
                seen[key] = usage
                turn = turns.setdefault(data.get("turn_id"), len(turns) + 1)
                responses.append({"timestamp": event["timestamp"], "turn": turn,
                                  "usage": usage, "thread_token_usage": total})
            elif event.get("type") == "event_msg" and data.get("type") == "token_count":
                raw = (data.get("info") or {}).get("total_token_usage")
                if raw is not None:
                    total = counters(raw)
                    if not snapshots or snapshots[-1]["thread_token_usage"] != total:
                        snapshots.append({"timestamp": event["timestamp"], "thread_token_usage": total})
    rows = responses or snapshots
    if not rows:
        raise ValueError("В журнале пока нет фактических счётчиков. Повтори после завершения ответа.")
    totals = [r["thread_token_usage"]["total_tokens"] for r in rows]
    if any(b < a for a, b in zip(totals, totals[1:])):
        raise ValueError("Счётчик чата уменьшился. До ручной сверки итог не публикуется.")
    source = "token_usage_record" if responses else "event_msg.token_count"
    summary = {"source": source, "through_utc": rows[-1]["timestamp"],
               "records": len(rows), "usage": rows[-1]["thread_token_usage"]}
    if responses:
        summary["turns"] = len(turns)
        summary["response_sum_matches_thread_total"] = all(
            sum(r["usage"].get(k, 0) for r in rows) == v for k, v in summary["usage"].items()
        )
    return rows, summary


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as out:
        tmp = Path(out.name)
        try:
            out.write(text)
        except Exception:
            tmp.unlink(missing_ok=True)
            raise
    try:
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def export(ident: str, dest: Path, scope: str) -> None:
    rows, summary = read_usage(find_session(ident), ident)
    summary = {"scope": scope, **summary}
    write_atomic(dest / "usage.jsonl", "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in rows))
    write_atomic(dest / "summary.json", json.dumps(summary, indent=2) + "\n")
    print(f"{summary['usage']['total_tokens']} токенов по журналу на {summary['through_utc']}. Файлы в {dest}")
    if summary.get("response_sum_matches_thread_total") is False:
        print("Разбивка по ответам неполна. Итог взят из накопительного счётчика самого Codex.", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action")
    commands.add_parser("start", help="Bind this project to its current development chat.")
    commands.add_parser("export", help="Refresh the bound chat's public usage files.")
    snapshot = commands.add_parser("snapshot", help="Export a separate, explicitly scoped chat.")
    snapshot.add_argument("--thread", required=True)
    snapshot.add_argument("--out", required=True, type=Path)
    snapshot.add_argument("--scope", choices=("snapshot", "preparation"), default="snapshot")
    args = parser.parse_args()
    if args.action == "start":
        ident = thread_id(os.environ.get("CODEX_THREAD_ID") or os.environ.get("CODEX_SESSION_ID") or "")
        find_session(ident)
        BINDING.parent.mkdir(exist_ok=True)
        try:
            with BINDING.open("x", encoding="utf-8") as target:
                target.write(ident + "\n")
        except FileExistsError:
            if thread_id(BINDING.read_text()) != ident:
                raise ValueError("Проект уже связан с другим чатом разработки.")
        print("Чат разработки привязан. Для итоговой выгрузки запусти python3 tools/export-usage.py.")
    elif args.action == "snapshot":
        export(thread_id(args.thread), args.out, args.scope)
    else:
        if not BINDING.is_file():
            raise ValueError("Сначала запусти python3 tools/export-usage.py start в чате разработки.")
        export(thread_id(BINDING.read_text()), DEVELOPMENT, "development")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
