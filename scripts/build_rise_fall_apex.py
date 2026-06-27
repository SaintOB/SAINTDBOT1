#!/usr/bin/env python3
"""Build Saint Rise/Fall Apex 2026 bot from the E/O Apex 2026 template.

Mechanics transferred 1:1:
  - V75 (1s)  - cleanest trend behaviour
  - 5-tick contracts (trend room for Rise/Fall vs 1-tick for digits)
  - $0.35 stake, 1.7x martingale, 4-loss hard stop
  - TP $3 / SL $3, 65% profit-lock at peak >= 75% of TP
  - Side-flip: CALL on win-side resets, PUT on loss escalates (and vice-versa)
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "bots" / "Saint_E_O_Bot_2026_Complete_0_5.xml"
DST = ROOT / "public" / "bots" / "Saint_Rise_Fall_Apex_2026.xml"

xml = SRC.read_text()

# 1. Swap trade type from digits/evenodd to callput/callput
xml = xml.replace(
    '<field name="TRADETYPECAT_LIST">digits</field>',
    '<field name="TRADETYPECAT_LIST">callput</field>',
)
xml = xml.replace(
    '<field name="TRADETYPE_LIST">evenodd</field>',
    '<field name="TRADETYPE_LIST">callput</field>',
)

# 2. Swap contract identifier strings (returned by read_details index 5)
#    DIGITODD -> CALL, DIGITEVEN -> PUT  (only inside <field name="TEXT">...</field>)
xml = xml.replace(
    '<field name="TEXT">DIGITODD</field>',
    '<field name="TEXT">CALL</field>',
)
xml = xml.replace(
    '<field name="TEXT">DIGITEVEN</field>',
    '<field name="TEXT">PUT</field>',
)

# 3. Lengthen contract duration from 1 tick to 5 ticks for trend room
xml = xml.replace(
    '<shadow type="math_number_positive" id="-c;M[80/$Wm,9JvG4YP~">\n            <field name="NUM">1</field>\n          </shadow>',
    '<shadow type="math_number_positive" id="-c;M[80/$Wm,9JvG4YP~">\n            <field name="NUM">5</field>\n          </shadow>',
    1,  # only the duration shadow, not other "1" values
)

# 4. Update notification copy
xml = xml.replace(
    "APEX 2026 PROTECTED YOUR ACCOUNT",
    "RISE/FALL APEX 2026 PROTECTED YOUR ACCOUNT",
)
xml = xml.replace(
    "APEX 2026 PROTECTED YOUR GAINS",
    "RISE/FALL APEX 2026 PROTECTED YOUR GAINS",
)

DST.write_text(xml)
print(f"Wrote {DST.relative_to(ROOT)} ({len(xml)} bytes)")
