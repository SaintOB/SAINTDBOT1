const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public/bots/Saint_E_O_Bot_2026_Complete_0_5.xml');
const DST = path.join(ROOT, 'public/bots/Saint_Rise_Fall_Apex_2026.xml');

let xml = fs.readFileSync(SRC, 'utf8');

xml = xml.replace(
  '<field name="TRADETYPECAT_LIST">digits</field>',
  '<field name="TRADETYPECAT_LIST">callput</field>'
);
xml = xml.replace(
  '<field name="TRADETYPE_LIST">evenodd</field>',
  '<field name="TRADETYPE_LIST">callput</field>'
);
xml = xml.split('<field name="TEXT">DIGITODD</field>').join('<field name="TEXT">CALL</field>');
xml = xml.split('<field name="TEXT">DIGITEVEN</field>').join('<field name="TEXT">PUT</field>');

const durOld = '<shadow type="math_number_positive" id="-c;M[80/$Wm,9JvG4YP~">\n            <field name="NUM">1</field>\n          </shadow>';
const durNew = '<shadow type="math_number_positive" id="-c;M[80/$Wm,9JvG4YP~">\n            <field name="NUM">5</field>\n          </shadow>';
if (!xml.includes(durOld)) {
  console.error('Duration shadow not found - aborting');
  process.exit(1);
}
xml = xml.replace(durOld, durNew);

xml = xml.split('APEX 2026 PROTECTED YOUR ACCOUNT').join('RISE/FALL APEX 2026 PROTECTED YOUR ACCOUNT');
xml = xml.split('APEX 2026 PROTECTED YOUR GAINS').join('RISE/FALL APEX 2026 PROTECTED YOUR GAINS');

const peakOld = '<block type="math_number" id="saint_075a"><field name="NUM">0.75</field></block>';
const peakNew = '<block type="math_number" id="saint_075a"><field name="NUM">0.7</field></block>';
if (!xml.includes(peakOld)) { console.error('peak threshold block not found'); process.exit(1); }
xml = xml.replace(peakOld, peakNew);

const floorOld = '<block type="math_number" id="saint_075b"><field name="NUM">0.65</field></block>';
const floorNew = '<block type="math_number" id="saint_075b"><field name="NUM">0.25</field></block>';
if (!xml.includes(floorOld)) { console.error('floor block not found'); process.exit(1); }
xml = xml.replace(floorOld, floorNew);

xml = xml.split('PROFIT LOCK 65%').join('PROFIT LOCK 25%');

fs.writeFileSync(DST, xml);
console.log(`Wrote ${path.relative(ROOT, DST)} (${xml.length} bytes)`);
