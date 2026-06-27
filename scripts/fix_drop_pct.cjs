const fs = require('fs');
const files = [
  'HF_V10_Rise_Fall_Bot.xml',
  'Saint_EO_Precision_Hunter_2026.xml',
  'Saint_EO_Pro_2026.xml',
  'Saint_E_O_Bot_2_0.xml',
];
const broken = '<block type="math_number" ${1}0.65${2}\n                              </block>';
const fixed  = '<block type="math_number" id="drop_pct_val">\n                                <field name="NUM">0.65</field>\n                              </block>';
for (const f of files) {
  const p = 'public/bots/' + f;
  let s = fs.readFileSync(p, 'utf8');
  if (s.includes(broken)) {
    s = s.replace(broken, fixed);
    fs.writeFileSync(p, s);
    console.log('repaired', f);
  } else {
    console.log('SKIPPED (no match)', f);
  }
}
