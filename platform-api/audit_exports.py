"""Server-side exports of completed Master Audit snapshots; no external data calls."""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import math
import re
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

import main
import master_audit

router = APIRouter(prefix="/api/audits", tags=["master-audit-exports"])
_render_slots = asyncio.Semaphore(2)
LABELS = {"day0": "Day 0", "day30": "Day 30", "day60": "Day 60", "extra": "Внеплановый"}
INK, MUTED, LINE, PAPER, GREEN, RED = "#1c1917", "#78716c", "#e7e5e4", "#fafaf9", "#15803d", "#be123c"


def clean(value):
    # XML 1.0 controls are not valid in PDF paragraphs or Excel cells.
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", str(value if value is not None else ""))


def date(value):
    if not value:
        return "—"
    return datetime.fromisoformat(str(value)).strftime("%d.%m.%Y")


def number(value):
    return "—" if value is None else f"{value:.1f}"


def flag(a):
    return bool(a["critical"] and not a["is_na"] and a["score"] == 0)


def display_score(a):
    return "N/A" if a["is_na"] else a["score"]


async def load_snapshot(audit_id):
    await master_audit.ensure_schema()
    pool = await main.get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction(isolation="repeatable_read", readonly=True):
            row = await conn.fetchrow("SELECT * FROM academy_audit_sessions WHERE id=$1", audit_id)
            if not row:
                raise HTTPException(404, "Аудит не найден")
            if row["status"] != "completed":
                raise HTTPException(409, "Сначала завершите аудит")
            answers = [dict(a) for a in await conn.fetch(
                "SELECT * FROM academy_audit_answers WHERE session_id=$1 ORDER BY item_id", audit_id
            )]
            # Use the existing scoring function, and refuse an inconsistent legacy snapshot.
            computed = await master_audit._score_session(conn, audit_id)
            audit = master_audit._session_row(row)
            if (computed["overall_score"] != audit["overall_score"]
                    or computed["red_flags_count"] != audit["red_flags_count"]
                    or computed["block_scores"] != audit["block_scores"]):
                raise HTTPException(409, "Итог аудита не совпадает с ответами. Повторно завершите аудит")
            # Null CRM IDs must never join different restaurants. Compare only matching versions
            # and checkpoints at or before the selected audit, not future audit cycles.
            history = await conn.fetch("""
                SELECT DISTINCT ON (audit_type) * FROM academy_audit_sessions
                WHERE status='completed' AND audit_type IN ('day0','day30','day60')
                  AND template_version=$3 AND started_at <= $4
                  AND (($1::text IS NOT NULL AND client_id=$1)
                    OR ($1::text IS NULL AND client_id IS NULL
                        AND lower(btrim(restaurant_title))=lower(btrim($2))))
                ORDER BY audit_type, started_at DESC, id DESC
            """, row["client_id"], row["restaurant_title"], row["template_version"], row["started_at"])
            checkpoints = {r["audit_type"]: master_audit._session_row(r) for r in history}
            if audit["audit_type"] in ("day0", "day30", "day60"):
                checkpoints[audit["audit_type"]] = audit
            checkpoint_answers = {}
            for kind, session in checkpoints.items():
                records = answers if session["id"] == audit_id else await conn.fetch(
                    "SELECT * FROM academy_audit_answers WHERE session_id=$1 ORDER BY item_id", session["id"]
                )
                checkpoint_answers[kind] = {int(a["item_id"]): dict(a) for a in records}
            key = row["client_id"] or ("title:" + row["restaurant_title"].strip().lower())
            baseline = await conn.fetchrow(
                "SELECT * FROM academy_audit_baselines WHERE baseline_key=$1", key
            )
            baseline = dict(baseline) if baseline else None
            if baseline:
                baseline["block_scores"] = master_audit._json_obj(baseline["block_scores"])
    blocks = [{"name": name, "score": audit["block_scores"].get(name)} for name in
              dict.fromkeys(a["section"] for a in answers)]
    problems = sorted(
        [a for a in answers if not a["is_na"] and a["score"] in (0, 1)],
        key=lambda a: (not flag(a), a["score"], -float(a["weight"]), a["item_id"]),
    )
    snapshot = dict(audit=audit, answers=answers, blocks=blocks,
                    red_flags=[a for a in answers if flag(a)], priorities=problems[:7],
                    checkpoints=checkpoints, checkpoint_answers=checkpoint_answers,
                    baseline=baseline)
    snapshot["snapshot_id"] = hashlib.sha256(json.dumps(
        snapshot, ensure_ascii=False, sort_keys=True, default=str
    ).encode()).hexdigest()[:16]
    return snapshot


def render_pdf(s):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
        Flowable,
    )

    # Installed in the build image; embedded into each PDF for mobile/Cyrillic support.
    font_dir = Path("/usr/share/fonts/truetype/dejavu")
    if "Academy" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("Academy", str(font_dir / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("AcademyBold", str(font_dir / "DejaVuSans-Bold.ttf")))
        pdfmetrics.registerFontFamily("Academy", normal="Academy", bold="AcademyBold")
    styles = {
        "body": ParagraphStyle("body", fontName="Academy", fontSize=10, leading=15,
                               textColor=colors.HexColor(INK), spaceAfter=8, splitLongWords=True),
        "small": ParagraphStyle("small", fontName="Academy", fontSize=8, leading=12,
                                textColor=colors.HexColor(MUTED), spaceAfter=5),
        "title": ParagraphStyle("title", fontName="AcademyBold", fontSize=35, leading=42,
                                textColor=colors.HexColor(INK), spaceAfter=22),
        "h": ParagraphStyle("h", fontName="AcademyBold", fontSize=21, leading=28,
                            textColor=colors.HexColor(INK), spaceAfter=16, keepWithNext=True),
        "sub": ParagraphStyle("sub", fontName="AcademyBold", fontSize=11, leading=16,
                              textColor=colors.HexColor(INK), spaceAfter=7, keepWithNext=True),
    }
    def p(value, style="body"):
        return Paragraph(escape(clean(value)).replace("\n", "<br/>"), styles[style])

    class Scale(Flowable):
        def __init__(self, value, width=145):
            super().__init__()
            self.value, self.width, self.height = value, width, 10

        def draw(self):
            self.canv.setFillColor(colors.HexColor(LINE))
            self.canv.roundRect(0, 1, self.width, 6, 3, fill=1, stroke=0)
            if self.value is not None and self.value > 0:
                self.canv.setFillColor(colors.HexColor(INK))
                self.canv.roundRect(0, 1, self.width * min(self.value, 100) / 100,
                                    6, 3, fill=1, stroke=0)

    def table(rows, widths, header=True):
        t = Table(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT", splitInRow=1)
        commands = [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ("LINEBELOW", (0, 0), (-1, -1), .5, colors.HexColor(LINE)),
        ]
        if header:
            commands.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(PAPER)))
        t.setStyle(TableStyle(commands))
        return t

    audit, baseline = s["audit"], s["baseline"]
    out = io.BytesIO()
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=46, rightMargin=46,
                            topMargin=66, bottomMargin=54,
                            title="Restaurant Health Report · " + clean(audit["restaurant_title"]),
                            author="Академия счастья")
    width = A4[0] - 92

    def frame(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor(INK))
        canvas.setFont("AcademyBold", 10)
        canvas.drawString(46, A4[1] - 35, "Академия счастья")
        canvas.setFont("Academy", 7)
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.drawRightString(A4[0] - 46, A4[1] - 35, "RESTAURANT OPERATING SYSTEM")
        canvas.setStrokeColor(colors.HexColor(LINE))
        canvas.line(46, 40, A4[0] - 46, 40)
        canvas.drawString(46, 26, "Master Audit · " + s["snapshot_id"])
        canvas.drawRightString(A4[0] - 46, 26, f"{doc.page:02d}")
        canvas.restoreState()

    story = [
        Spacer(1, 46), p("MASTER AUDIT / " + LABELS.get(audit["audit_type"], audit["audit_type"]), "small"),
        Spacer(1, 12), p("Restaurant\nHealth Report", "title"),
        p(audit["restaurant_title"], "h"),
        p(date(audit["completed_at"]) + " · " + audit["template_version"], "small"),
        Spacer(1, 28),
        p(number(audit["overall_score"]) + " / 100", "title"),
        p("Общий индекс состояния ресторана", "body"),
        Scale(audit["overall_score"], width), Spacer(1, 22),
        p(f'{len(s["answers"])} стандартов · {len(s["blocks"])} блоков · '
          f'{audit["red_flags_count"]} Red Flags'),
        p("Основан на зафиксированных оценках и наблюдениях аудита. "
          "Ключевые разрывы и приоритеты — на следующих страницах.", "small"),
        PageBreak(), p("01 / Картина по блокам", "h"),
    ]
    story.append(table(
        [[p("Блок", "sub"), p("Индекс", "sub"), p("Шкала 0–100", "sub")]] +
        [[p(b["name"]), p(number(b["score"])), Scale(b["score"])] for b in s["blocks"]],
        [width - 232, 67, 165],
    ))
    na = sum(a["is_na"] for a in s["answers"])
    story += [Spacer(1, 12), p(
        f"N/A: {na} из 150. Индекс = сумма (оценка / 2 × вес) / сумма применимых весов × 100. "
        "N/A исключены из расчёта; «—» означает отсутствие применимых оценок в блоке. "
        "При всех N/A платформа сохраняет общий индекс 0; это не оценка качества.", "small"),
        PageBreak(), p("02 / Главные выводы", "h"),
        p(f'Критических разрывов: {len(s["red_flags"])}. '
          f'Пунктов с оценкой 0: {sum(a["score"] == 0 and not a["is_na"] for a in s["answers"])}. '
          f'Пунктов с оценкой 1: {sum(a["score"] == 1 and not a["is_na"] for a in s["answers"])}.'),
        p("Приоритеты сформированы по оценкам: сначала критические нули, затем остальные "
          "нули и частично работающие стандарты, внутри группы — по весу. "
          "Это предложения для плана работы, а не утверждённые обязательства.", "small"),
    ]
    if not s["priorities"]:
        story.append(p("Разрывов по применимым оценённым стандартам не зафиксировано. "
                       "Следующий шаг — подтвердить устойчивость результата на следующей контрольной точке."))
    for index, a in enumerate(s["priorities"], 1):
        action = "Внедрить и проверить стандарт" if a["score"] == 0 else "Добиться регулярного выполнения"
        excerpt = clean(a["comment"])
        if len(excerpt) > 320:
            excerpt = excerpt[:317].rstrip() + "…"
        group = [p(f'{index:02d} / {a["item_code"]} · {action}', "sub"),
                 p(a["standard"])]
        if excerpt:
            group.append(p("Наблюдение: " + excerpt, "small"))
        group.append(p("Подтверждение результата: " + clean(a["evidence_hint"]), "small"))
        # Avoid a single very long standard/evidence group becoming an unsplittable page.
        story.extend(group + [Spacer(1, 9)])
    story += [PageBreak(), p("03 / Red Flags", "h"),
              p("Критические стандарты с оценкой 0. Требуют первоочередной проверки и плана исправления.", "small")]
    if s["red_flags"]:
        story.append(table(
            [[p("Пункт", "sub"), p("Критический разрыв", "sub")]] +
            [[p(a["item_code"]), p(a["standard"])] for a in s["red_flags"]],
            [65, width - 65],
        ))
    else:
        story.append(p("Критических нулевых оценок не зафиксировано."))
    if len(s["checkpoints"]) > 1 or baseline:
        story += [PageBreak(), p("04 / Динамика и ориентир", "h"),
                  p("Последняя завершённая сессия каждой контрольной точки на дату выбранного аудита. "
                    "Сравниваются только аудиты той же версии методики.", "small")]
        kinds = ["day0", "day30", "day60"]
        rows = [[p("Показатель", "sub")] + [p(LABELS[k], "sub") for k in kinds]]
        for label, field in [("Дата", "completed_at"), ("Общий индекс", "overall_score"), ("Red Flags", "red_flags_count")]:
            rows.append([p(label)] + [p(
                date(s["checkpoints"][k][field]) if field == "completed_at"
                else number(s["checkpoints"][k][field])
            ) if k in s["checkpoints"] else p("—") for k in kinds])
        for block in s["blocks"]:
            rows.append([p(block["name"])] + [p(number(
                s["checkpoints"].get(k, {}).get("block_scores", {}).get(block["name"])
            )) for k in kinds])
        story.append(table(rows, [width - 225, 75, 75, 75]))
        if baseline:
            story += [Spacer(1, 20), p("Healthy Baseline", "h"),
                      p(f'Зафиксированный ориентир от {date(baseline["created_at"])}: '
                        f'{number(baseline["overall_score"])} / 100. '
                        f'Отклонение текущего индекса: '
                        f'{audit["overall_score"] - baseline["overall_score"]:+.1f} п.п.'),
                      p("Источник: " + baseline["source_session_id"], "small")]
    story += [Spacer(1, 20), p(
        "Полная рабочая детализация всех 150 стандартов, комментарии и evidence доступны "
        "в Excel-выгрузке этого же аудита.", "small")]
    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    return out.getvalue()


def render_xlsx(s):
    import xlsxwriter

    out = io.BytesIO()
    wb = xlsxwriter.Workbook(out, {"in_memory": True, "strings_to_formulas": False,
                                    "strings_to_urls": False})
    wb.set_properties({"title": "Restaurant Health Report", "company": "Академия счастья",
                       "comments": "Master Audit snapshot " + s["snapshot_id"]})
    base = {"font_name": "Calibri", "font_size": 11, "font_color": INK, "valign": "top"}
    body = wb.add_format({**base, "text_wrap": True})
    muted = wb.add_format({**base, "font_color": MUTED, "font_size": 10, "text_wrap": True})
    title = wb.add_format({**base, "bold": True, "font_size": 24})
    header = wb.add_format({**base, "bold": True, "bg_color": LINE, "text_wrap": True})
    metric = wb.add_format({**base, "bold": True, "font_size": 28, "num_format": "0.0"})
    value_fmt = wb.add_format({**base, "num_format": "0.0"})
    red = wb.add_format({**base, "bg_color": "#fff1f2", "font_color": RED, "text_wrap": True})
    green = wb.add_format({**base, "bg_color": "#f0fdf4", "font_color": GREEN, "text_wrap": True})

    def sheet(name):
        ws = wb.add_worksheet(name)
        ws.hide_gridlines(2)
        ws.set_tab_color(INK)
        ws.set_default_row(24)
        ws.set_landscape()
        ws.set_paper(9)
        ws.fit_to_pages(1, 0)
        ws.set_footer("&LАкадемия счастья&RСтраница &P из &N")
        return ws

    def grid(ws, headers, rows, widths):
        for col, width in enumerate(widths):
            ws.set_column(col, col, width, body)
        ws.write_row(0, 0, headers, header)
        ws.set_row(0, 36)
        for row, values in enumerate(rows, 1):
            ws.write_row(row, 0, [clean(v) if isinstance(v, str) else v for v in values], body)
            lines = max((sum(max(1, math.ceil(len(part) / max(1, widths[col] - 2)))
                             for part in clean(v).split("\n"))
                         for col, v in enumerate(values)), default=1)
            ws.set_row(row, min(300, max(30, lines * 14 + 8)))
        ws.freeze_panes(1, 2)
        ws.autofilter(0, 0, len(rows), len(headers) - 1)
        ws.repeat_rows(0)
        ws.print_area(0, 0, max(1, len(rows)), len(headers) - 1)

    audit = s["audit"]
    dash = sheet("Dashboard")
    dash.set_column("A:A", 4)
    dash.set_column("B:B", 43)
    dash.set_column("C:C", 18)
    dash.set_column("D:D", 4)
    dash.set_column("E:H", 15)
    dash.merge_range("B2:H3", "Restaurant Health Report", title)
    dash.merge_range("B5:H6", clean(audit["restaurant_title"]), wb.add_format({**base, "bold": True, "font_size": 18, "text_wrap": True}))
    dash.set_row(4, 45)
    dash.set_row(5, 45)
    dash.merge_range("B7:H7", LABELS.get(audit["audit_type"], audit["audit_type"]) +
                     " · " + date(audit["completed_at"]) + " · Академия счастья", muted)
    dash.write("B9", "Общий индекс", header)
    dash.write("E9", "Red Flags", header)
    dash.write("G9", "Стандартов", header)
    dash.write("B10", audit["overall_score"], metric)
    dash.write("E10", audit["red_flags_count"], metric)
    dash.write("G10", len(s["answers"]), metric)
    dash.write_row("B13", ["Блок", "Индекс / 100"], header)
    for row, block in enumerate(s["blocks"], 13):
        dash.write(row, 1, clean(block["name"]), body)
        dash.write(row, 2, block["score"], value_fmt)
        dash.set_row(row, 36)
    end = 12 + len(s["blocks"])
    dash.conditional_format(13, 2, end, 2, {"type": "data_bar", "bar_color": GREEN,
                                          "min_type": "num", "min_value": 0,
                                          "max_type": "num", "max_value": 100})
    chart = wb.add_chart({"type": "bar"})
    chart.add_series({"name": "Индекс", "categories": ["Dashboard", 13, 1, end, 1],
                      "values": ["Dashboard", 13, 2, end, 2],
                      "fill": {"color": INK}, "border": {"none": True}})
    chart.set_x_axis({"min": 0, "max": 100})
    chart.set_y_axis({"reverse": True, "num_font": {"size": 9}})
    chart.set_legend({"none": True})
    chart.set_chartarea({"border": {"none": True}})
    chart.set_size({"width": 560, "height": 350})
    dash.insert_chart("E13", chart)
    note_row = max(end + 3, 29)
    dash.merge_range(note_row, 1, note_row + 2, 7,
                     "Снимок завершённого аудита. Баллы совпадают с PDF и платформой на момент выгрузки. "
                     "Изменения в Excel не обновляют Dashboard и Postgres. Ответственного и срок "
                     "можно заполнить на листе «Приоритеты».", muted)
    dash.merge_range(note_row + 4, 1, note_row + 5, 7,
                     "N/A исключены из весов. Пустой индекс блока = все оценки N/A. "
                     "Полный текст длинных комментариев доступен в строке формул.", muted)
    dash.freeze_panes(12, 2)
    dash.print_area(0, 0, note_row + 6, 13)

    headers = ["№", "Код", "Блок", "Стандарт", "Вес", "Критичный", "0 / 1 / 2 / N/A",
               "Комментарий / evidence", "Как проверить", "Red Flag", "Day 0", "Day 30", "Day 60"]
    rows = []
    for a in s["answers"]:
        scores = []
        for kind in ("day0", "day30", "day60"):
            other = s["checkpoint_answers"].get(kind, {}).get(a["item_id"])
            scores.append(display_score(other) if other else None)
        rows.append([a["item_id"], a["item_code"], a["section"], a["standard"], a["weight"],
                     "ДА" if a["critical"] else "НЕТ", display_score(a), a["comment"],
                     a["evidence_hint"], "RED FLAG" if flag(a) else ""] + scores)
    detail = sheet("Master Audit")
    grid(detail, headers, rows, [6, 10, 32, 65, 10, 12, 17, 70, 60, 15, 12, 12, 12])
    detail.conditional_format("G2:G151", {"type": "cell", "criteria": "==", "value": 0, "format": red})
    detail.conditional_format("G2:G151", {"type": "cell", "criteria": "==", "value": 2, "format": green})
    detail.conditional_format("J2:J151", {"type": "text", "criteria": "containing",
                                         "value": "RED FLAG", "format": red})
    flags = sheet("Red Flags")
    grid(flags, headers[:10], [r[:10] for r in rows if r[9]],
         [6, 10, 32, 65, 10, 12, 17, 70, 60, 15])
    if not s["red_flags"]:
        flags.write("D2", "Критических нулевых оценок нет", green)

    priorities = sheet("Приоритеты")
    grid(priorities, ["Приоритет", "Код", "Стандарт / проблема", "Оценка", "Комментарий / evidence",
                      "Проверка результата", "Ответственный", "Срок", "Статус"],
         [[i, a["item_code"], a["standard"], a["score"], a["comment"], a["evidence_hint"],
           a.get("owner", ""), a.get("deadline", ""), "Не назначен"]
          for i, a in enumerate(s["priorities"], 1)],
         [12, 10, 65, 10, 70, 60, 24, 18, 22])
    if s["priorities"]:
        priorities.data_validation(1, 8, len(s["priorities"]), 8, {
            "validate": "list", "source": ["Не назначен", "В работе", "Готово"]})

    comparison = sheet("Day 0-30-60")
    kinds = ("day0", "day30", "day60")
    checkpoints = s["checkpoints"]
    comparisons = [
        ["ID аудита"] + [checkpoints.get(k, {}).get("id", "") for k in kinds],
        ["Дата"] + [date(checkpoints[k]["completed_at"]) if k in checkpoints else "" for k in kinds],
        ["Общий индекс"] + [checkpoints.get(k, {}).get("overall_score") for k in kinds],
        ["Red Flags"] + [checkpoints.get(k, {}).get("red_flags_count") for k in kinds],
    ] + [[b["name"]] + [checkpoints.get(k, {}).get("block_scores", {}).get(b["name"])
                        for k in kinds] for b in s["blocks"]]
    grid(comparison, ["Показатель", "Day 0", "Day 30", "Day 60"], comparisons, [52, 27, 27, 27])
    if s["baseline"]:
        baseline = sheet("Healthy Baseline")
        b = s["baseline"]
        grid(baseline, ["Показатель", "Baseline", "Текущий аудит", "Разница, п.п."],
             [["Дата", date(b["created_at"]), date(audit["completed_at"]), None],
              ["ID аудита", b["source_session_id"], audit["id"], None],
              ["Общий индекс", b["overall_score"], audit["overall_score"],
               round(audit["overall_score"] - b["overall_score"], 1)]] +
             [[x["name"], b["block_scores"].get(x["name"]), x["score"],
               round(x["score"] - b["block_scores"][x["name"]], 1)
               if x["score"] is not None and b["block_scores"].get(x["name"]) is not None else None]
              for x in s["blocks"]], [52, 27, 27, 22])
    source = sheet("Методика")
    grid(source, ["Поле", "Значение"], [
        ["Источник", "Railway Postgres · academy_audit_sessions / answers / baselines"],
        ["ID аудита", audit["id"]], ["Snapshot", s["snapshot_id"]],
        ["Версия", audit["template_version"]],
        ["Формула", "Σ(оценка / 2 × вес) / Σ применимых весов × 100; округление до 0,1"],
        ["N/A", "Не применимо; исключается из числителя и знаменателя. При всех N/A общий индекс платформы = 0."],
        ["Red Flag", "Критичный стандарт с оценкой 0; N/A не считается разрывом."],
        ["Сравнение", "Последняя завершённая сессия каждой точки не позднее выбранного аудита, того же ресторана и версии."],
        ["Приоритеты", "До 7 пунктов: критичные нули, другие нули, единицы; внутри группы — вес по убыванию."],
        ["Ответственный / срок", "В текущей модели БД не хранятся. Поля оставлены для работы в Excel."],
        ["Длинный текст", "Полностью сохранён в ячейках. Для чтения используйте строку формул или увеличьте высоту строки."],
    ], [28, 115])
    wb.close()
    return out.getvalue()


@router.get("/{audit_id}/export/{format}")
async def export_audit(audit_id: str, format: str, username: str = Depends(main.require_session)):
    if format not in ("pdf", "xlsx"):
        raise HTTPException(400, "Поддерживаются PDF и Excel")
    main._rate_limit("audit-export:" + username, 12, 60)
    async with _render_slots:
        snapshot = await load_snapshot(audit_id)
        payload = await run_in_threadpool(render_pdf if format == "pdf" else render_xlsx, snapshot)
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", audit_id)[:80]
    media = "application/pdf" if format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return Response(payload, media_type=media, headers={
        "Content-Disposition": f'attachment; filename="Restaurant_Health_Report_{safe_id}.{format}"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Audit-Snapshot": snapshot["snapshot_id"],
    })
