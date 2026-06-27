'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'private-bots');
const NEW_MARTINGALE = '1.7';
const NEW_LOSS_LIMIT = '5';

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function findVarId(xml, name) {
    const m = xml.match(new RegExp('<variable id="([^"]+)">' + escRe(name) + '</variable>', 'i'));
    return m ? m[1] : null;
}

function setNumberInVariableSet(xml, varId, varName, newNum) {
    if (!varId) return { xml, changed: 0 };
    const re = new RegExp(
        '(<block type="variables_set"[^>]*>\\s*<field name="VAR" id="' +
        escRe(varId) + '">' + escRe(varName) +
        '</field>\\s*<value name="VALUE">[\\s\\S]*?<field name="NUM">)([0-9.]+)(</field>)',
        'g'
    );
    let changed = 0;
    const out = xml.replace(re, (_, a, _old, b) => { changed++; return a + newNum + b; });
    return { xml: out, changed };
}

// For bots without MaxLossStreak: rewrite math_number children of any
// logic_compare whose A side is a variables_get of LossStreak.
function setLossStreakCompare(xml, lossStreakId, newNum) {
    if (!lossStreakId) return { xml, changed: 0 };
    let changed = 0;
    const re = new RegExp(
        '(<block type="logic_compare"[^>]*>[\\s\\S]*?' +
        '<value name="A">\\s*<block type="variables_get"[^>]*>\\s*' +
        '<field name="VAR" id="' + escRe(lossStreakId) + '">LossStreak</field>\\s*</block>\\s*</value>' +
        '[\\s\\S]*?<value name="B">\\s*<block type="math_number"[^>]*>\\s*' +
        '<field name="NUM">)([0-9.]+)(</field>)',
        'g'
    );
    const out = xml.replace(re, (_, a, _old, b) => { changed++; return a + newNum + b; });
    return { xml: out, changed };
}

// Rewrite "X LOSSES" (and "X LOSSES IN A ROW") in <field name="TEXT">…</field>
function rewriteLossMessages(xml, newNum) {
    let changed = 0;
    const re = /(<field name="TEXT">[^<]*?\b)(\d+)(\s+LOSSES\b[^<]*?<\/field>)/gi;
    const out = xml.replace(re, (_, a, _n, b) => { changed++; return a + newNum + b; });
    return { xml: out, changed };
}

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.xml'));
const summary = [];

for (const f of files) {
    const full = path.join(DIR, f);
    let xml = fs.readFileSync(full, 'utf8');

    const martId = findVarId(xml, 'Martingale');
    const lossStreakId = findVarId(xml, 'LossStreak');
    const maxLossId = findVarId(xml, 'MaxLossStreak');

    let mChanged = 0, lChanged = 0, msgChanged = 0;

    if (martId) {
        const r = setNumberInVariableSet(xml, martId, 'Martingale', NEW_MARTINGALE);
        xml = r.xml; mChanged = r.changed;
    }

    if (maxLossId) {
        const r = setNumberInVariableSet(xml, maxLossId, 'MaxLossStreak', NEW_LOSS_LIMIT);
        xml = r.xml; lChanged = r.changed;
    } else if (lossStreakId) {
        const r = setLossStreakCompare(xml, lossStreakId, NEW_LOSS_LIMIT);
        xml = r.xml; lChanged = r.changed;
    }

    const r3 = rewriteLossMessages(xml, NEW_LOSS_LIMIT);
    xml = r3.xml; msgChanged = r3.changed;

    fs.writeFileSync(full, xml);
    summary.push({ f, mChanged, lChanged, msgChanged });
}

console.log('file | martingale_writes | loss_limit_writes | message_writes');
for (const s of summary) {
    console.log(`${s.f} | ${s.mChanged} | ${s.lChanged} | ${s.msgChanged}`);
}
