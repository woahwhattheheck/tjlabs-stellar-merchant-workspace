#!/usr/bin/env python3
"""Render the complete proposed DataCove workshare from its retained input."""
from __future__ import annotations
import argparse, hashlib, json, os
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether

def digest(data):
    return hashlib.sha256(data).hexdigest()

def font_family():
    choices = [
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/usr/share/fonts/dejavu"),
        Path("/usr/local/share/fonts"),
    ]
    for root in choices:
        regular, bold = root / "DejaVuSans.ttf", root / "DejaVuSans-Bold.ttf"
        if regular.is_file() and bold.is_file():
            pdfmetrics.registerFont(TTFont("DC", str(regular)))
            pdfmetrics.registerFont(TTFont("DC-Bold", str(bold)))
            pdfmetrics.registerFontFamily("DC", normal="DC", bold="DC-Bold", italic="DC", boldItalic="DC-Bold")
            return
    raise RuntimeError("Supply installed DejaVuSans.ttf and DejaVuSans-Bold.ttf for embedded-font rendering.")

def render(input_path, output_path):
    raw = input_path.read_bytes()
    v = json.loads(raw)
    if v.get("schema") != "tjlabs.datacove-workshare.v1":
        raise ValueError("Use the original DataCove workshare input.")
    if (v["fee"]["fixed"], v["fee"]["kickoff"], v["fee"]["acceptance"], v["delivery"]["businessDays"]) != (7800, 3900, 3900, 12):
        raise ValueError("The original proposed commercial terms differ.")
    font_family()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    navy, teal, muted = colors.HexColor("#16324A"), colors.HexColor("#047C83"), colors.HexColor("#4F6473")
    styles = {
        "eyebrow": ParagraphStyle("eyebrow", fontName="DC-Bold", fontSize=9, leading=12, textColor=teal, spaceAfter=8),
        "title": ParagraphStyle("title", fontName="DC-Bold", fontSize=22, leading=27, textColor=navy, spaceAfter=10),
        "subtitle": ParagraphStyle("subtitle", fontName="DC", fontSize=10.5, leading=15, textColor=muted, spaceAfter=12),
        "h": ParagraphStyle("h", fontName="DC-Bold", fontSize=12, leading=16, textColor=navy, spaceBefore=11, spaceAfter=5),
        "body": ParagraphStyle("body", fontName="DC", fontSize=9.7, leading=14, textColor=navy, spaceAfter=7),
        "small": ParagraphStyle("small", fontName="DC", fontSize=8, leading=11.5, textColor=muted, spaceAfter=5),
        "callout": ParagraphStyle("callout", fontName="DC-Bold", fontSize=12, leading=18, textColor=navy, spaceAfter=0),
    }
    def p(text, style="body"):
        return Paragraph(text, styles[style])
    def text(value):
        return escape(str(value))
    story = [p("TOKENJUNKIE LABS / PROPOSED IMPLEMENTATION WORKSHARE", "eyebrow"),
        p("SensorThings commissioning", "title"),
        p("A complete source-to-FROST delivery for DataCove", "subtitle")]
    price = Table([[p("USD 7,800 fixed<br/>12 business days", "callout"),
                    p("USD 3,900 at kickoff<br/>USD 3,900 at accepted handoff", "body")]], colWidths=[234, 258])
    price.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#EAF5F3")),
        ("BOX",(0,0),(-1,-1),0.5,colors.HexColor("#C7E4E0")),("VALIGN",(0,0),(-1,-1),"TOP"),
        ("LEFTPADDING",(0,0),(-1,-1),13),("RIGHTPADDING",(0,0),(-1,-1),13),
        ("TOPPADDING",(0,0),(-1,-1),11),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
    story += [price, p("The delivery", "h"),
        p("We implement one reviewed source-to-FROST commissioning workshare inside DataCove's selected customer or reference installation. The operating project retains the original inputs, mapping decisions, exact target changes, native request/response history and a complete receiving handoff."),
        p("The selected scope is one source family, an initial and corrected edition, up to twenty selected streams and twenty thousand observations per edition, one existing FROST target, one operator host and a separate receiving environment."),
        p("What the work includes", "h")]
    for i, item in enumerate(v["deliverables"], 1):
        story.append(p("<b>" + str(i) + ". " + text(item["title"]) + ".</b> " + text(item["text"])))
    story += [p("Existing application and selected reference", "h"),
        p("The complete operating application and original-client runtime are merged. The retained Hamburg source has 660 observations in 28 original responses. The STAM asset build and full reference target commissioning continue in their original operations; this proposal does not assert a completed target run or customer acceptance.", "small"),
        p('Full source, guides and exact source selection: <link href="' + text(v["links"]["source"]) + '" color="#047C83">open the merged commissioning application</link>.', "small"),
        PageBreak(), p("ACCEPTANCE / RESPONSIBILITIES / RECEIVING", "eyebrow"),
        p("An accountable handoff", "title"),
        p("The acceptance owner can follow every selected source record through its reviewed mapping, native target outcome and receiving package.", "subtitle"),
        p("Acceptance on the selected installation", "h")]
    for i, requirement in enumerate(v["acceptance"], 1):
        story.append(p("<b>" + str(i) + ".</b> " + text(requirement)))
    story += [p("Working arrangement", "h"),
        p("<b>DataCove retains:</b> " + text(v["responsibilities"]["datacove"])),
        p("<b>TokenJunkie Labs delivers:</b> " + text(v["responsibilities"]["tjlabs"])),
        p("The twelve-business-day clock starts after " + text(v["clockStart"]).rstrip(".") + "."),
        p("Scope changes and costs", "h"),
        p("The fixed fee covers the agreed population and two editions in the selected target and environments. Additional sources, populations, models, services or environments are agreed before extending scope. Hosting, storage and service charges follow the selected services. Source rights, domain interpretation and scientific validation remain with their respective owners."),
        p("Choose the first delivery", "h"),
        p("Which current harmonization or SensorThings onboarding would benefit from a complete implementation workshare? Agree the source and corrected edition, the target/host and receiving environment, the entity/time mapping and the named acceptance owner."),
        p('DataCove source fit: <link href="https://datacove.eu/services/" color="#047C83">published services</link> · <link href="https://datacove.eu/contact/" color="#047C83">published contact</link>. Original FROST, STAM, Leaflet and dependency notices remain with the delivered source.', "small")]
    pages = []
    def frame(canvas, doc):
        pages.append(doc.page)
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#CCD7DE"))
        canvas.line(48, 39, 547, 39)
        canvas.setFont("DC", 7.5); canvas.setFillColor(muted)
        canvas.drawString(48, 27, "DataCove / proposed workshare / " + str(v["preparedOn"]))
        canvas.drawRightString(547, 27, "TokenJunkie Labs  |  " + str(doc.page) + " / 2")
        canvas.restoreState()
    doc = SimpleDocTemplate(str(output_path), pagesize=(595.276,841.89), rightMargin=48, leftMargin=48,
        topMargin=42, bottomMargin=52, title="DataCove SensorThings Commissioning Workshare",
        author="TokenJunkie Labs", subject="USD 7,800 fixed implementation and commissioning workshare")
    doc.build(story, onFirstPage=frame, onLaterPages=frame)
    if pages != [1,2]:
        raise RuntimeError("Expected exactly two pages; adjust the retained layout before delivery: " + repr(pages))
    output = output_path.read_bytes()
    return {"schema":"commons.datacove-proposal-render.v1","input":{"filename":input_path.name,"bytes":len(raw),"sha256":digest(raw)},
        "output":{"filename":output_path.name,"bytes":len(output),"sha256":digest(output)},"pages":len(pages),
        "font":"embedded DejaVu Sans","source_selection":v["sourceSelection"],"state":"RENDERED_REQUIRES_VISUAL_REVIEW"}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args=parser.parse_args()
    print(json.dumps(render(args.input,args.output),indent=2))

if __name__ == "__main__":
    main()
