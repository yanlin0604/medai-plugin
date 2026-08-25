from __future__ import annotations

import html
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = ROOT / "outputs" / "inpatient-record-summary"
OUT = OUT_DIR / "住院病历生成系统.pptx"
LOGO = ROOT / "src-tauri" / "icons" / "icon.png"

SLIDE_W = 13.333333
SLIDE_H = 7.5
EMU = 914400

COLORS = {
    "navy": "102A43",
    "blue": "1E3A8A",
    "sky": "DBEAFE",
    "mint": "D1FAE5",
    "green": "059669",
    "purple": "6D28D9",
    "lav": "EDE9FE",
    "rose": "E11D48",
    "rose_bg": "FFE4E6",
    "amber": "F59E0B",
    "amber_bg": "FEF3C7",
    "slate": "475569",
    "muted": "64748B",
    "line": "CBD5E1",
    "panel": "F8FAFC",
    "white": "FFFFFF",
    "black": "0F172A",
}


def e(value: float) -> int:
    return int(round(value * EMU))


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def fill_xml(color: str | None) -> str:
    if not color:
        return "<a:noFill/>"
    return f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'


def line_xml(color: str | None = None, width: int = 1) -> str:
    if not color or width <= 0:
        return "<a:ln><a:noFill/></a:ln>"
    return f'<a:ln w="{width * 12700}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill></a:ln>'


def run_xml(text: str, size: int, color: str, bold: bool = False) -> str:
    return (
        f'<a:r><a:rPr lang="zh-CN" sz="{size * 100}"{" b=\"1\"" if bold else ""}>'
        f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
        '<a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/>'
        f'</a:rPr><a:t>{esc(text)}</a:t></a:r>'
    )


def paragraphs_xml(text: str, size: int, color: str, bold: bool, align: str) -> str:
    parts = str(text).split("\n") if text else [""]
    out = []
    for part in parts:
        out.append(f'<a:p><a:pPr algn="{align}"/>{run_xml(part, size, color, bold)}</a:p>')
    return "".join(out)


def shape_xml(
    sid: int,
    name: str,
    x: float,
    y: float,
    w: float,
    h: float,
    text: str = "",
    fill: str | None = None,
    line: str | None = None,
    font_size: int = 16,
    color: str = COLORS["black"],
    bold: bool = False,
    radius: bool = False,
    align: str = "l",
    valign: str = "mid",
    margin: int = 9,
) -> str:
    prst = "roundRect" if radius else "rect"
    body = ""
    if text:
        body = (
            f'<p:txBody><a:bodyPr wrap="square" anchor="{valign}" lIns="{margin * 12700}" '
            f'rIns="{margin * 12700}" tIns="{margin * 12700}" bIns="{margin * 12700}"/>'
            f'<a:lstStyle/>{paragraphs_xml(text, font_size, color, bold, align)}</p:txBody>'
        )
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{e(x)}" y="{e(y)}"/><a:ext cx="{e(w)}" cy="{e(h)}"/></a:xfrm>'
        f'<a:prstGeom prst="{prst}"><a:avLst/></a:prstGeom>{fill_xml(fill)}{line_xml(line)}</p:spPr>{body}</p:sp>'
    )


def image_xml(sid: int, rel_id: str, x: float, y: float, w: float, h: float) -> str:
    return (
        f'<p:pic><p:nvPicPr><p:cNvPr id="{sid}" name="MedAI Logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>'
        f'<p:blipFill><a:blip r:embed="{rel_id}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        f'<p:spPr><a:xfrm><a:off x="{e(x)}" y="{e(y)}"/><a:ext cx="{e(w)}" cy="{e(h)}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
    )


def connector_xml(sid: int, x: float, y: float, w: float, h: float, color: str = COLORS["blue"]) -> str:
    return (
        f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{sid}" name="connector"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>'
        f'<p:spPr><a:xfrm><a:off x="{e(x)}" y="{e(y)}"/><a:ext cx="{e(w)}" cy="{e(h)}"/></a:xfrm>'
        f'<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>'
        f'<a:ln w="25400"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:tailEnd type="none"/><a:headEnd type="triangle"/></a:ln>'
        '</p:spPr></p:cxnSp>'
    )


def base_slide_xml(content: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg>'
        '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        f'{content}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    )


def header(title: str, subtitle: str = "") -> list[str]:
    items = [
        shape_xml(10, "eyebrow", 0.55, 0.28, 2.3, 0.28, "阶段总结", None, None, 11, COLORS["green"], True, False, "l", "mid", 0),
        shape_xml(11, "title", 0.52, 0.56, 8.9, 0.48, title, None, None, 24, COLORS["navy"], True, False, "l", "mid", 0),
    ]
    if subtitle:
        items.append(shape_xml(12, "subtitle", 0.55, 1.08, 9.8, 0.3, subtitle, None, None, 10, COLORS["muted"], False, False, "l", "mid", 0))
    items.append(shape_xml(13, "rule", 0.55, 1.42, 12.2, 0.02, "", COLORS["line"], None))
    return items


def metric_card(sid: int, x: float, y: float, w: float, h: float, num: str, label: str, bg: str, fg: str) -> str:
    return (
        shape_xml(sid, "metric", x, y, w, h, "", bg, "FFFFFF", radius=True)
        + shape_xml(sid + 1, "metric_num", x + 0.15, y + 0.18, w - 0.3, 0.46, num, None, None, 24, fg, True, False, "c", "mid", 0)
        + shape_xml(sid + 2, "metric_label", x + 0.18, y + 0.72, w - 0.36, 0.38, label, None, None, 10, COLORS["slate"], True, False, "c", "mid", 0)
    )


def slide1() -> tuple[str, dict[str, str]]:
    content = [
        shape_xml(2, "bg_band", 0, 0, SLIDE_W, SLIDE_H, "", COLORS["panel"], None),
        shape_xml(3, "accent", 0, 0, 0.22, SLIDE_H, "", COLORS["blue"], None),
        shape_xml(4, "orb1", 9.2, -0.65, 4.7, 4.7, "", "E0F2FE", None, radius=True),
        shape_xml(5, "orb2", 10.2, 3.65, 3.2, 3.2, "", COLORS["mint"], None, radius=True),
        shape_xml(6, "title", 0.72, 1.34, 8.2, 1.05, "住院病历生成\n阶段性总结", None, None, 34, COLORS["navy"], True, False, "l", "mid", 0),
        shape_xml(7, "subtitle", 0.76, 2.7, 7.2, 0.55, "MedAI Plugin：AI 智能病历书写助手桌面插件", None, None, 15, COLORS["slate"], False, False, "l", "mid", 0),
        shape_xml(8, "date", 0.78, 3.38, 5.5, 0.32, "阶段评审材料 · 2026年8月", None, None, 11, COLORS["muted"], True, False, "l", "mid", 0),
        shape_xml(9, "quote", 0.78, 5.78, 10.6, 0.48, "定位：围绕住院部医生真实工作流，把 EMR/HIS 数据、语音、AI 生成、医生审核和安全回写串成闭环。", COLORS["white"], COLORS["line"], 13, COLORS["navy"], True, True, "l"),
    ]
    rels = {}
    if LOGO.exists():
        content.append(image_xml(20, "rId2", 10.15, 1.12, 1.35, 1.35))
        rels["rId2"] = "../media/logo.png"
    return base_slide_xml("".join(content)), rels


def slide2() -> tuple[str, dict[str, str]]:
    content = header("当前结论：从原型进入可演示闭环", "不是单一文书生成器，而是按住院文书场景拆出的工作台体系。")
    content += [
        metric_card(30, 0.72, 1.82, 2.4, 1.45, "15+", "文书类型配置覆盖", COLORS["sky"], COLORS["blue"]),
        metric_card(40, 3.38, 1.82, 2.4, 1.45, "4类", "交互范式沉淀", COLORS["mint"], COLORS["green"]),
        metric_card(50, 6.04, 1.82, 2.4, 1.45, "闭环", "生成-编辑-回写-版本", COLORS["lav"], COLORS["purple"]),
        metric_card(60, 8.7, 1.82, 2.4, 1.45, "23个", "核心单测文件", COLORS["amber_bg"], COLORS["amber"]),
        shape_xml(70, "takeaway", 0.75, 3.78, 11.8, 1.0, "阶段性判断：入院记录、出院记录、字段级生成助手和演示回写链路已经具备较完整的端到端体验；查房/手术语音、死亡记录边界页、证据引用与组合字段能力已经成型，但生产级 HIS/ASR/质控仍需继续对接和加固。", COLORS["white"], COLORS["line"], 16, COLORS["black"], True, True, "l"),
        shape_xml(80, "note1", 1.0, 5.26, 3.45, 1.0, "可汇报\n已有医生端工作台、模板驱动字段、草稿保存、历史版本、防串户提示。", COLORS["panel"], COLORS["line"], 13, COLORS["slate"], False, True),
        shape_xml(90, "note2", 4.75, 5.26, 3.45, 1.0, "可演示\n入院/出院整篇生成、字段重新生成、字段回填、查房实时路由。", COLORS["panel"], COLORS["line"], 13, COLORS["slate"], False, True),
        shape_xml(100, "note3", 8.5, 5.26, 3.45, 1.0, "需补齐\n真实院内接口、稳定 ASR 服务、质控规则库、安装部署与 E2E 验证。", COLORS["panel"], COLORS["line"], 13, COLORS["slate"], False, True),
    ]
    return base_slide_xml("".join(content)), {}


def slide3() -> tuple[str, dict[str, str]]:
    content = header("文书覆盖：按住院场景分组配置", "源码中的文书注册表把文书、数据源、输入模式、时限和工作台路由解耦。")
    columns = [
        ("时限必填", "住院病案首页\n入院记录\n首次病程记录\n日常病程记录", COLORS["rose_bg"], COLORS["rose"]),
        ("按需病程", "主治医生查房记录\n主治医生首次查房记录\n疑难病例讨论\n交接班 / 转科 / 阶段小结\n会诊记录", COLORS["mint"], COLORS["green"]),
        ("临床事件", "抢救记录\n出院记录 / 出院小结\n术前小结 / 手术记录\n围术期记录\n死亡记录 / 知情同意书", COLORS["sky"], COLORS["blue"]),
    ]
    x = 0.72
    for i, (title, body, bg, fg) in enumerate(columns):
        content.append(shape_xml(30 + i * 10, title, x + i * 4.15, 1.82, 3.72, 4.05, "", bg, "FFFFFF", radius=True))
        content.append(shape_xml(31 + i * 10, title, x + i * 4.15 + 0.18, 2.02, 3.36, 0.34, title, None, None, 15, fg, True, False, "c", "mid", 0))
        content.append(shape_xml(32 + i * 10, "body", x + i * 4.15 + 0.36, 2.62, 3.0, 2.55, body, None, None, 13, COLORS["black"], False, False, "l"))
    content.append(shape_xml(80, "footer", 0.75, 6.22, 11.65, 0.48, "覆盖方式不是把每类文书写死，而是以 docCode + paradigm + template 字段 schema 驱动；新增文书主要增加配置和模板。", COLORS["panel"], COLORS["line"], 12, COLORS["slate"], True, True, "l"))
    return base_slide_xml("".join(content)), {}


def slide4() -> tuple[str, dict[str, str]]:
    content = header("交互范式：四种工作方式覆盖不同病历任务", "不同文书的 AI 介入深度不一样，系统已经把它们拆成可复用范式。")
    items = [
        ("系统自动汇总", "静默拉取 EMR/HIS/LIS/PACS，直接生成结构化草稿", COLORS["green"], COLORS["mint"]),
        ("事后多模态补录", "医嘱、检验、手动/语音补充后，由 AI 组装成稿", COLORS["blue"], COLORS["sky"]),
        ("长录音互动", "床旁录音、ASR、患者路由、片段归属，再生成字段", COLORS["purple"], COLORS["lav"]),
        ("AI 能力边界", "死亡记录等高风险场景：AI 只做格式整理，强制人工审核", COLORS["rose"], COLORS["rose_bg"]),
    ]
    for i, (title, body, fg, bg) in enumerate(items):
        y = 1.78 + i * 1.2
        content.append(shape_xml(30 + i * 10, "tag", 0.8, y, 2.35, 0.72, title, bg, None, 14, fg, True, True, "c"))
        content.append(shape_xml(31 + i * 10, "body", 3.45, y, 7.9, 0.72, body, COLORS["white"], COLORS["line"], 14, COLORS["black"], False, True, "l"))
    content.append(shape_xml(90, "side", 11.6, 1.72, 0.18, 5.0, "", COLORS["blue"], None, radius=True))
    content.append(shape_xml(91, "side_text", 11.9, 2.12, 0.56, 4.15, "可配置\n可路由\n可扩展", None, None, 16, COLORS["blue"], True, False, "c"))
    return base_slide_xml("".join(content)), {}


def slide5() -> tuple[str, dict[str, str]]:
    content = header("病历生成链路：从资料到回写形成闭环", "核心链路已经具备工程骨架，后端运行时负责模板、值生成、证据和版本。")
    steps = [
        ("资料接入", "HIS / EMR\nLIS / PACS\nASR / 医嘱"),
        ("模板驱动", "docCode\n字段 schema\n组合模板"),
        ("AI 生成", "整篇生成\n单字段生成\n选区改写"),
        ("医生审核", "纸面预览\n段落编辑\n证据引用"),
        ("安全回写", "防串户\n字段回填\n版本快照"),
    ]
    for i, (title, body) in enumerate(steps):
        x = 0.7 + i * 2.48
        content.append(shape_xml(30 + i * 10, "step", x, 2.0, 2.08, 1.75, "", COLORS["white"], COLORS["line"], radius=True))
        content.append(shape_xml(31 + i * 10, "num", x + 0.18, 2.16, 0.42, 0.42, str(i + 1), COLORS["blue"], None, 12, COLORS["white"], True, True, "c"))
        content.append(shape_xml(32 + i * 10, "title", x + 0.18, 2.72, 1.72, 0.26, title, None, None, 14, COLORS["navy"], True, False, "c", "mid", 0))
        content.append(shape_xml(33 + i * 10, "body", x + 0.2, 3.1, 1.68, 0.5, body, None, None, 10, COLORS["slate"], False, False, "c", "mid", 0))
        if i < len(steps) - 1:
            content.append(connector_xml(80 + i, x + 2.1, 2.86, 0.36, 0.0))
    content.append(shape_xml(95, "principle", 0.82, 4.85, 11.6, 0.9, "关键设计原则：前端不固定病历字段，依赖后台模板和值生成接口；正文与结构化字段同源，提交时同时生成可回写字段、完整正文和历史版本。", COLORS["panel"], COLORS["line"], 14, COLORS["black"], True, True, "l"))
    return base_slide_xml("".join(content)), {}


def slide6() -> tuple[str, dict[str, str]]:
    content = header("入院 / 出院记录：当前最完整的成稿工作台", "两类高频文书已具备整篇生成、字段编辑、回写和版本能力。")
    left = [
        ("入院记录", "语音候选自动填字段\n支持新住院临时信息采纳\n整篇生成与单字段重生成\nF8 / 一键回填正式提交", COLORS["lav"], COLORS["purple"]),
        ("出院记录", "运行时模板严格对接\n入院/出院日期与住院天数联动\n重新生成全部或单段\n纸面预览、通读、历史版本", COLORS["mint"], COLORS["green"]),
    ]
    for i, (title, body, bg, fg) in enumerate(left):
        y = 1.83 + i * 2.25
        content.append(shape_xml(30 + i * 10, "card", 0.82, y, 5.6, 1.75, "", bg, None, radius=True))
        content.append(shape_xml(31 + i * 10, "title", 1.1, y + 0.18, 2.4, 0.35, title, None, None, 17, fg, True, False, "l", "mid", 0))
        content.append(shape_xml(32 + i * 10, "body", 1.1, y + 0.66, 4.75, 0.82, body, None, None, 12, COLORS["black"], False, False, "l"))
    content += [
        shape_xml(70, "maturity", 7.0, 1.82, 4.8, 3.98, "", COLORS["white"], COLORS["line"], radius=True),
        shape_xml(71, "m_title", 7.25, 2.08, 4.3, 0.36, "成熟能力清单", None, None, 16, COLORS["navy"], True, False, "c", "mid", 0),
        shape_xml(72, "m_body", 7.35, 2.72, 4.1, 2.35, "• 后端模板 + 字段值渐进加载\n• 草稿自动保存与恢复\n• 必填校验和提交确认\n• 历史版本与变更摘要\n• 防串户锁定与解锁\n• 字段级重新生成与正文编辑", None, None, 13, COLORS["slate"], False, False, "l"),
    ]
    return base_slide_xml("".join(content)), {}


def slide7() -> tuple[str, dict[str, str]]:
    content = header("字段级助手：从“整篇生成”下沉到当前字段", "适合医生在 HIS/CS 端逐字段编辑时调用，减少覆盖整篇带来的风险。")
    content += [
        shape_xml(30, "left", 0.78, 1.8, 3.55, 3.8, "触发上下文\n\n当前患者\n当前文书\n当前字段\n选中文本\n医生/科室", COLORS["sky"], None, 15, COLORS["blue"], True, True, "c"),
        connector_xml(31, 4.42, 3.7, 0.58, 0),
        shape_xml(40, "mid", 5.05, 1.8, 3.55, 3.8, "生成策略\n\n空字段生成\n已有内容追加\n选区改写\n组合子项生成\n证据引用编号", COLORS["lav"], None, 15, COLORS["purple"], True, True, "c"),
        connector_xml(41, 8.7, 3.7, 0.58, 0),
        shape_xml(50, "right", 9.35, 1.8, 3.05, 3.8, "回填策略\n\n填充 / 追加\n覆盖选区\n字段写回审计\n患者文书一致性校验", COLORS["mint"], None, 15, COLORS["green"], True, True, "c"),
        shape_xml(60, "bottom", 0.85, 6.1, 11.3, 0.44, "组合字段已经支持“固定项 / 手工项 / AI 项”拆分，出院医嘱等复杂字段可按模板逐项生成、预览并统一回填。", COLORS["panel"], COLORS["line"], 12, COLORS["slate"], True, True, "l"),
    ]
    return base_slide_xml("".join(content)), {}


def slide8() -> tuple[str, dict[str, str]]:
    content = header("语音驱动场景：查房、入院、手术三条线", "语音能力已进入业务流，但依赖外部 ASR/字段抽取服务的稳定接入。")
    rows = [
        ("入院语音", "ASR + 字段抽取候选，自动写入入院记录段落；新患者可先采纳临时建档信息。", COLORS["purple"], COLORS["lav"]),
        ("病区查房", "全病区连续录音，按床号/姓名路由到患者，结束后沉淀查房片段供病程字段生成。", COLORS["blue"], COLORS["sky"]),
        ("手术记录", "多段录音分片上传、合并后转写，再由 AI 拆成手术日期、名称、经过、术后诊断等字段。", COLORS["green"], COLORS["mint"]),
    ]
    for i, (title, body, fg, bg) in enumerate(rows):
        y = 1.78 + i * 1.45
        content.append(shape_xml(30 + i * 10, "label", 0.82, y, 2.0, 0.9, title, bg, None, 16, fg, True, True, "c"))
        content.append(shape_xml(31 + i * 10, "body", 3.1, y, 8.75, 0.9, body, COLORS["white"], COLORS["line"], 13, COLORS["black"], False, True, "l"))
    content.append(shape_xml(80, "warn", 0.86, 6.12, 11.4, 0.46, "阶段边界：浏览器 MediaRecorder 与 WebSocket 流已接入业务页面；Tauri Rust 层的原生 CPAL 录音命令仍以占位为主。", COLORS["amber_bg"], "FCD34D", 12, "92400E", True, True, "l"))
    return base_slide_xml("".join(content)), {}


def slide9() -> tuple[str, dict[str, str]]:
    content = header("质量、安全与回写：已形成闭环意识", "项目已经把医疗文书最关键的“可控、可追溯、不错患”放入主流程。")
    grid = [
        ("医生审核优先", "生成后进入段落编辑、纸面预览、提交确认；死亡记录不生成核心结论。"),
        ("防串户锁", "宿主系统活动患者切换时锁定提交、重生成和资料插入。"),
        ("证据引用", "字段生成可带 evidenceSummary，组合字段支持统一证据编号预览。"),
        ("回写闭环", "支持 BS 演示 inbox、CS HTTP 字段回填、全文字段顺序载荷。"),
        ("版本留痕", "提交后创建历史版本，保存正文、字段、字段顺序和变更摘要。"),
        ("测试覆盖", "23 个单测文件覆盖运行时、字段助手、证据、查房、版本和 UI 编辑组件。"),
    ]
    for i, (title, body) in enumerate(grid):
        x = 0.72 + (i % 3) * 4.1
        y = 1.72 + (i // 3) * 2.05
        content.append(shape_xml(30 + i * 10, "cell", x, y, 3.55, 1.46, "", COLORS["white"], COLORS["line"], radius=True))
        content.append(shape_xml(31 + i * 10, "title", x + 0.18, y + 0.16, 3.12, 0.28, title, None, None, 14, COLORS["blue"], True, False, "l", "mid", 0))
        content.append(shape_xml(32 + i * 10, "body", x + 0.2, y + 0.56, 3.05, 0.56, body, None, None, 10, COLORS["slate"], False, False, "l"))
    content.append(shape_xml(95, "env", 0.82, 6.08, 11.35, 0.45, "本次环境限制：当前 shell 找不到 npm/node，单测未能现场执行；测试覆盖数量来自仓库测试文件清单。", COLORS["panel"], COLORS["line"], 11, COLORS["muted"], False, True, "l"))
    return base_slide_xml("".join(content)), {}


def slide10() -> tuple[str, dict[str, str]]:
    content = header("下一阶段：从演示闭环走向院内部署闭环", "重点不再是“能否生成”，而是“真实系统中能否稳定、合规、可追溯地使用”。")
    lanes = [
        ("接口落地", "真实 HIS/EMR 患者上下文\nLIS/PACS/医嘱资料源\n病案首页费用/诊断/签名"),
        ("AI 能力", "稳定 ASR 与字段抽取\n质控规则库与评分\nICD 推荐与术语规范"),
        ("工程交付", "Tauri 原生录音补齐\nE2E 与回归测试\n安装包、更新、安全策略"),
        ("试点运营", "科室模板分级配置\n医生反馈闭环\n场景日志与效果指标"),
    ]
    for i, (title, body) in enumerate(lanes):
        x = 0.78 + i * 3.08
        content.append(shape_xml(30 + i * 10, "lane", x, 1.82, 2.62, 4.05, "", COLORS["white"], COLORS["line"], radius=True))
        content.append(shape_xml(31 + i * 10, "title", x + 0.22, 2.08, 2.18, 0.36, title, COLORS["blue"] if i == 0 else COLORS["panel"], None, 14, COLORS["white"] if i == 0 else COLORS["navy"], True, True, "c"))
        content.append(shape_xml(32 + i * 10, "body", x + 0.28, 2.78, 2.05, 1.75, body, None, None, 12, COLORS["slate"], False, False, "l"))
    content.append(shape_xml(90, "summary", 0.9, 6.22, 11.1, 0.5, "建议阶段目标：选择 2-3 个高频文书（入院记录、出院记录、日常/查房病程）做真实接口试点，形成可度量闭环。", COLORS["mint"], None, 13, COLORS["green"], True, True, "l"))
    return base_slide_xml("".join(content)), {}


def clean_cover() -> tuple[str, dict[str, str]]:
    content = [
        shape_xml(2, "bg", 0, 0, SLIDE_W, SLIDE_H, "", COLORS["white"], None),
        shape_xml(3, "bar", 0, 0, 0.28, SLIDE_H, "", COLORS["blue"], None),
        shape_xml(4, "eyebrow", 0.82, 0.74, 2.4, 0.3, "阶段总结", None, None, 12, COLORS["green"], True, False, "l", "mid", 0),
        shape_xml(5, "title", 0.82, 1.1, 5.8, 1.15, "住院病历生成系统", None, None, 32, COLORS["navy"], True, False, "l", "mid", 0),
        shape_xml(6, "subtitle", 0.84, 2.38, 5.9, 0.45, "AI智能病历书写助手 · 阶段性总结", None, None, 15, COLORS["slate"], False, False, "l", "mid", 0),
        shape_xml(7, "desc", 0.84, 2.95, 5.8, 0.66, "围绕住院部医生真实工作流，把病历模板、语音、AI生成、审核回写和版本留痕串成闭环。", None, None, 13, COLORS["muted"], False, False, "l"),
        shape_xml(8, "card", 7.2, 0.92, 4.95, 4.95, "", COLORS["panel"], COLORS["line"], radius=True),
        shape_xml(9, "card_title", 7.5, 1.2, 4.35, 0.3, "本阶段已形成的能力", None, None, 16, COLORS["navy"], True, False, "c", "mid", 0),
        metric_card(20, 7.48, 1.72, 1.3, 1.12, "15+", "文书覆盖", COLORS["sky"], COLORS["blue"]),
        metric_card(30, 8.93, 1.72, 1.3, 1.12, "4类", "交互范式", COLORS["mint"], COLORS["green"]),
        metric_card(40, 10.38, 1.72, 1.3, 1.12, "闭环", "生成到回写", COLORS["lav"], COLORS["purple"]),
        shape_xml(50, "bullet", 7.52, 3.25, 4.3, 1.65, "• 入院/出院工作台可用\n• 字段级 AI 生成与改写\n• 查房、手术语音链路已接入\n• 防串户、版本与写回已落地", None, None, 13, COLORS["slate"], False, False, "l"),
        shape_xml(60, "tag", 7.48, 5.22, 4.35, 0.52, "阶段状态：可演示闭环，正在走向院内部署闭环", COLORS["mint"], None, 13, COLORS["green"], True, True, "c"),
    ]
    return base_slide_xml("".join(content)), {}


def clean_position() -> tuple[str, dict[str, str]]:
    content = header("一、项目定位与价值", "系统不是单纯的“AI写病历”按钮，而是面向住院医生的文书工作台。")
    content += [
        shape_xml(20, "left", 0.8, 1.8, 4.3, 4.1, "", COLORS["panel"], COLORS["line"], radius=True),
        shape_xml(21, "ltitle", 1.08, 2.08, 3.7, 0.3, "项目定位", None, None, 18, COLORS["navy"], True, False, "l", "mid", 0),
        shape_xml(22, "lbody", 1.08, 2.62, 3.6, 2.8, "面向医院住院部医生\n嵌入 HIS / EMR 侧边栏\n以住院文书生成与回写为核心\n覆盖入院、出院、查房、手术等高频场景", None, None, 14, COLORS["slate"], False, False, "l"),
        shape_xml(30, "v1", 5.55, 1.86, 2.15, 1.72, "提效\n减少重复录入\n让医生把时间留给判断", COLORS["sky"], None, 17, COLORS["blue"], True, True, "c"),
        shape_xml(31, "v2", 7.95, 1.86, 2.15, 1.72, "规范\n模板驱动\n减少字段缺项与写法漂移", COLORS["mint"], None, 17, COLORS["green"], True, True, "c"),
        shape_xml(32, "v3", 10.35, 1.86, 2.0, 1.72, "可追溯\n版本留痕\n回写过程有据可查", COLORS["lav"], None, 17, COLORS["purple"], True, True, "c"),
        shape_xml(40, "strip", 5.55, 4.1, 6.8, 1.68, "价值判断\n\n把病历生成从“单次文本生产”提升为“数据拉取 - AI生成 - 医生编辑 - 安全回写 - 历史版本”的连续工作流。", COLORS["white"], COLORS["line"], 15, COLORS["black"], False, False, "l"),
    ]
    return base_slide_xml("".join(content)), {}


def clean_modules() -> tuple[str, dict[str, str]]:
    content = header("二、核心功能模块", "系统已经按住院病历的实际任务拆成可复用模块。")
    cards = [
        ("文书注册与模板", "按 docCode 统一注册文书\n支持时限必填、按需病程、事件文书\n模板和字段 schema 可配置", COLORS["sky"], COLORS["blue"]),
        ("AI 生成与编辑", "整篇生成、单字段生成、选区改写\n段落编辑、纸面预览、草稿恢复\n组合字段可拆分后逐项处理", COLORS["lav"], COLORS["purple"]),
        ("语音采集与路由", "入院语音建档\n查房实时录音与床号路由\n手术录音分片上传、合并、转写", COLORS["mint"], COLORS["green"]),
        ("回写与版本管理", "一键回写到宿主系统\n防串户锁定\n提交后生成历史版本和变更摘要", COLORS["amber_bg"], COLORS["amber"]),
    ]
    for i, (title, body, bg, fg) in enumerate(cards):
        x = 0.8 + (i % 2) * 5.9
        y = 1.84 + (i // 2) * 2.15
        content.append(shape_xml(20 + i * 10, "card", x, y, 5.0, 1.7, "", bg, "FFFFFF", radius=True))
        content.append(shape_xml(21 + i * 10, "title", x + 0.22, y + 0.17, 3.6, 0.3, title, None, None, 16, fg, True, False, "l", "mid", 0))
        content.append(shape_xml(22 + i * 10, "body", x + 0.22, y + 0.62, 4.4, 0.75, body, None, None, 12, COLORS["black"], False, False, "l"))
    return base_slide_xml("".join(content)), {}


def clean_innovation() -> tuple[str, dict[str, str]]:
    content = header("三、核心亮点与技术创新", "亮点不在“会生成”，而在生成过程被拆成了可控、可扩展、可审计的结构。")
    blocks = [
        ("范式驱动", "将 15 类文书按 4 类交互范式组织，文书与容器解耦。新增文书更偏配置扩展，而不是改主流程。", COLORS["sky"], COLORS["blue"]),
        ("字段级智能", "既支持整篇生成，也支持当前字段、组合子项、选区改写，适合临床医生逐段核对的真实习惯。", COLORS["lav"], COLORS["purple"]),
        ("安全闭环", "防串户锁、证据引用、版本留痕、提交确认都进入主链路，避免 AI 直接覆盖医生工作结果。", COLORS["mint"], COLORS["green"]),
    ]
    for i, (title, body, bg, fg) in enumerate(blocks):
        x = 0.82 + i * 4.12
        content.append(shape_xml(20 + i * 10, "card", x, 1.9, 3.48, 3.55, "", bg, "FFFFFF", radius=True))
        content.append(shape_xml(21 + i * 10, "title", x + 0.2, 2.1, 2.96, 0.3, title, None, None, 17, fg, True, False, "c", "mid", 0))
        content.append(shape_xml(22 + i * 10, "body", x + 0.24, 2.72, 2.98, 1.8, body, None, None, 13, COLORS["slate"], False, False, "l"))
    content.append(shape_xml(60, "footer", 0.86, 5.92, 11.25, 0.62, "技术创新的核心，是把 AI 从“生成结果”转向“生成过程可控”。这让系统更接近院内可用的生产工具，而不是单次演示工具。", COLORS["white"], COLORS["line"], 13, COLORS["black"], True, True, "l"))
    return base_slide_xml("".join(content)), {}


def clean_results() -> tuple[str, dict[str, str]]:
    content = header("四、阶段性成果", "当前已形成可演示、可联调的工程基础。")
    content += [
        metric_card(20, 0.82, 1.78, 1.9, 1.2, "15+", "文书注册", COLORS["sky"], COLORS["blue"]),
        metric_card(30, 2.92, 1.78, 1.9, 1.2, "4类", "交互范式", COLORS["mint"], COLORS["green"]),
        metric_card(40, 5.02, 1.78, 1.9, 1.2, "23个", "单测文件", COLORS["lav"], COLORS["purple"]),
        metric_card(50, 7.12, 1.78, 1.9, 1.2, "可回写", "闭环流程", COLORS["amber_bg"], COLORS["amber"]),
        shape_xml(60, "left", 0.82, 3.35, 3.75, 2.05, "已完成\n\n• 入院记录工作台\n• 出院记录工作台\n• 字段助手与组合字段\n• 查房 / 手术语音链路\n• 版本与回写机制", COLORS["panel"], COLORS["line"], 13, COLORS["slate"], False, True, "l"),
        shape_xml(61, "mid", 4.76, 3.35, 3.75, 2.05, "已联通\n\n• HIS / EMR 上下文\n• 模板与值生成接口\n• 证据引用和审计\n• 防串户状态检查", COLORS["panel"], COLORS["line"], 13, COLORS["slate"], False, True, "l"),
        shape_xml(62, "right", 8.7, 3.35, 3.35, 2.05, "待补齐\n\n• 生产级 ASR 稳定性\n• 真实院内接口联调\n• 质控规则库\n• 安装部署与回归测试", COLORS["panel"], COLORS["line"], 13, COLORS["slate"], False, True, "l"),
    ]
    return base_slide_xml("".join(content)), {}


def clean_next() -> tuple[str, dict[str, str]]:
    content = header("五、下一步规划", "下一阶段重点是从“可演示”走向“可试点、可落地”。")
    phases = [
        ("第一步：接口落地", "接真实 HIS / EMR / LIS / PACS 数据\n打通患者上下文、诊断、费用、签名\n优先覆盖入院与出院高频文书", COLORS["sky"], COLORS["blue"]),
        ("第二步：能力增强", "补齐稳定 ASR 与字段抽取\n完善质控规则和 ICD 推荐\n增强组合字段与证据链能力", COLORS["lav"], COLORS["purple"]),
        ("第三步：院内试点", "选 2-3 个高频文书先试点\n按科室模板和指标验收\n形成医生反馈与迭代闭环", COLORS["mint"], COLORS["green"]),
    ]
    for i, (title, body, bg, fg) in enumerate(phases):
        x = 0.82 + i * 4.12
        content.append(shape_xml(20 + i * 10, "card", x, 1.9, 3.48, 3.85, "", bg, "FFFFFF", radius=True))
        content.append(shape_xml(21 + i * 10, "title", x + 0.18, 2.08, 3.0, 0.5, title, None, None, 16, fg, True, False, "c", "mid", 0))
        content.append(shape_xml(22 + i * 10, "body", x + 0.22, 2.88, 2.98, 1.85, body, None, None, 13, COLORS["slate"], False, False, "l"))
    content.append(shape_xml(60, "footer", 0.86, 6.0, 11.3, 0.52, "建议把阶段目标定义为：在 2-3 个文书场景里完成真实接口试点，形成可度量、可复盘的院内应用闭环。", COLORS["mint"], None, 13, COLORS["green"], True, True, "l"))
    return base_slide_xml("".join(content)), {}


SLIDES = [clean_cover, clean_position, clean_modules, clean_innovation, clean_results, clean_next]


def rels_xml(rels: dict[str, tuple[str, str]]) -> str:
    items = []
    for rid, (rtype, target) in rels.items():
        items.append(f'<Relationship Id="{rid}" Type="{rtype}" Target="{target}"/>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(items)
        + '</Relationships>'
    )


def write_package() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    slides = [fn() for fn in SLIDES]

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types_xml(len(slides), include_png=LOGO.exists()))
        z.writestr("_rels/.rels", package_rels_xml())
        z.writestr("docProps/core.xml", core_xml(now))
        z.writestr("docProps/app.xml", app_xml(len(slides)))
        z.writestr("ppt/presentation.xml", presentation_xml(len(slides)))
        z.writestr("ppt/_rels/presentation.xml.rels", presentation_rels_xml(len(slides)))
        z.writestr("ppt/theme/theme1.xml", theme_xml())
        z.writestr("ppt/slideMasters/slideMaster1.xml", slide_master_xml())
        z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels_xml({
            "rId1": ("http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout", "../slideLayouts/slideLayout1.xml"),
            "rId2": ("http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme", "../theme/theme1.xml"),
        }))
        z.writestr("ppt/slideLayouts/slideLayout1.xml", slide_layout_xml())
        z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels_xml({
            "rId1": ("http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster", "../slideMasters/slideMaster1.xml")
        }))
        if LOGO.exists():
            z.write(LOGO, "ppt/media/logo.png")
        for index, (slide_xml, custom_rels) in enumerate(slides, start=1):
            z.writestr(f"ppt/slides/slide{index}.xml", slide_xml)
            slide_rels = {
                "rId1": ("http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout", "../slideLayouts/slideLayout1.xml"),
            }
            for rid, target in custom_rels.items():
                slide_rels[rid] = ("http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", target)
            z.writestr(f"ppt/slides/_rels/slide{index}.xml.rels", rels_xml(slide_rels))


def content_types_xml(count: int, include_png: bool) -> str:
    slide_overrides = "".join(
        f'<Override PartName="/ppt/slides/slide{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for i in range(1, count + 1)
    )
    png_default = '<Default Extension="png" ContentType="image/png"/>' if include_png else ""
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{png_default}'
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        f'{slide_overrides}</Types>'
    )


def package_rels_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        '</Relationships>'
    )


def presentation_rels_xml(count: int) -> str:
    rels = [
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>',
    ]
    rels.extend(
        f'<Relationship Id="rId{i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{i}.xml"/>'
        for i in range(1, count + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + "".join(rels)
        + '</Relationships>'
    )


def presentation_xml(count: int) -> str:
    slide_ids = "".join(f'<p:sldId id="{255 + i}" r:id="rId{i + 2}"/>' for i in range(1, count + 1))
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        f'<p:sldIdLst>{slide_ids}</p:sldIdLst>'
        f'<p:sldSz cx="{e(SLIDE_W)}" cy="{e(SLIDE_H)}" type="wide"/>'
        '<p:notesSz cx="6858000" cy="9144000"/>'
        '</p:presentation>'
    )


def slide_master_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
        '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
        '<p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'
    )


def slide_layout_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">'
        '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
    )


def theme_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="MedAI">'
        '<a:themeElements><a:clrScheme name="MedAI">'
        '<a:dk1><a:srgbClr val="0F172A"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>'
        '<a:dk2><a:srgbClr val="334155"/></a:dk2><a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>'
        '<a:accent1><a:srgbClr val="1E3A8A"/></a:accent1><a:accent2><a:srgbClr val="059669"/></a:accent2>'
        '<a:accent3><a:srgbClr val="6D28D9"/></a:accent3><a:accent4><a:srgbClr val="E11D48"/></a:accent4>'
        '<a:accent5><a:srgbClr val="F59E0B"/></a:accent5><a:accent6><a:srgbClr val="64748B"/></a:accent6>'
        '<a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="6D28D9"/></a:folHlink></a:clrScheme>'
        '<a:fontScheme name="MedAI"><a:majorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:majorFont>'
        '<a:minorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:minorFont></a:fontScheme>'
        '<a:fmtScheme name="MedAI"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
        '<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
        '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>'
        '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'
    )


def core_xml(now: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        '<dc:title>住院病历生成阶段性总结</dc:title><dc:creator>Codex</dc:creator>'
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created>'
        f'<dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>'
        '</cp:coreProperties>'
    )


def app_xml(count: int) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        '<Application>Microsoft PowerPoint</Application>'
        f'<PresentationFormat>Widescreen</PresentationFormat><Slides>{count}</Slides><Notes>0</Notes>'
        '<Company>MedAI</Company></Properties>'
    )


if __name__ == "__main__":
    if OUT.exists():
        try:
            OUT.unlink()
        except PermissionError:
            OUT = OUT.with_name("住院病历生成系统-优化版.pptx")
            if OUT.exists():
                OUT.unlink()
    write_package()
    print(OUT)
