/**
 * Inject a 65%-of-peak profit-lock guard into DBot Blockly XMLs that don't have one.
 *
 * Logic injected at the TOP of after_purchase:
 *   1. if total_profit > PeakProfit -> PeakProfit = total_profit
 *   2. if PeakProfit > 0 AND total_profit < PeakProfit * 0.65 -> print + Stake = null
 *      (Stake = null is the existing halt convention in these bots)
 *
 * Operates string-side (no xmldom serialization) to preserve formatting and
 * avoid breaking sibling block whitespace.
 */
const fs = require('fs');

const FILES = [
  'public/bots/Saint_OverUnder_SmartGrid_2026.xml',
  'public/bots/Saint_OU_SmartGrid_Pro_2026.xml',
  'public/bots/Saint_O5U6_SmartGrid_2026.xml',
  'public/bots/Saint_EO_DiffersPro_2026.xml',
  'public/bots/Saint_EO_MatchesPro_2026.xml',
];

// Stake variable id is "stake" in all 5 target bots (verified).
const STAKE_VAR_ID = 'stake';
const PEAK_VAR_ID  = 'peak_profit_v';

// Build the injected block string with a unique anchor placeholder for the
// existing first-block-of-after_purchase chain.
const INJECT = `<block type="controls_if" id="pl_peak_update">
        <value name="IF0">
          <block type="logic_compare" id="pl_pu_cmp">
            <field name="OP">GT</field>
            <value name="A"><block type="total_profit" id="pl_pu_tp"></block></value>
            <value name="B"><block type="variables_get" id="pl_pu_get"><field name="VAR" id="${PEAK_VAR_ID}">PeakProfit</field></block></value>
          </block>
        </value>
        <statement name="DO0">
          <block type="variables_set" id="pl_pu_set">
            <field name="VAR" id="${PEAK_VAR_ID}">PeakProfit</field>
            <value name="VALUE"><block type="total_profit" id="pl_pu_tp2"></block></value>
          </block>
        </statement>
        <next>
          <block type="controls_if" id="pl_lock_check">
            <value name="IF0">
              <block type="logic_operation" id="pl_and">
                <field name="OP">AND</field>
                <value name="A">
                  <block type="logic_compare" id="pl_peak_pos">
                    <field name="OP">GT</field>
                    <value name="A"><block type="variables_get" id="pl_peak_get"><field name="VAR" id="${PEAK_VAR_ID}">PeakProfit</field></block></value>
                    <value name="B"><block type="math_number" id="pl_zero"><field name="NUM">0</field></block></value>
                  </block>
                </value>
                <value name="B">
                  <block type="logic_compare" id="pl_drop_cmp">
                    <field name="OP">LT</field>
                    <value name="A"><block type="total_profit" id="pl_now"></block></value>
                    <value name="B">
                      <block type="math_arithmetic" id="pl_floor">
                        <field name="OP">MULTIPLY</field>
                        <value name="A"><block type="variables_get" id="pl_peak_floor"><field name="VAR" id="${PEAK_VAR_ID}">PeakProfit</field></block></value>
                        <value name="B"><block type="math_number" id="pl_065"><field name="NUM">0.65</field></block></value>
                      </block>
                    </value>
                  </block>
                </value>
              </block>
            </value>
            <statement name="DO0">
              <block type="text_print" id="pl_print" editable="false">
                <value name="TEXT"><shadow type="text" id="pl_msg"><field name="TEXT">$ PROFIT LOCK 65% - PROTECTING YOUR GAINS !</field></shadow></value>
                <next>
                  <block type="variables_set" id="pl_stop">
                    <field name="VAR" id="${STAKE_VAR_ID}">Stake</field>
                    <value name="VALUE"><block type="logic_null" id="pl_null"></block></value>
                  </block>
                </next>
              </block>
            </statement>
            <next>__EXISTING_FIRST_BLOCK__</next>
          </block>
        </next>
      </block>`;

function findMatchingClose(s, openIdx) {
  // openIdx points at the '<' of an opening <block ...> tag.
  // Returns the index of the character AFTER its matching </block>.
  let i = openIdx;
  let depth = 0;
  const blockOpenRe = /<block\b[^>]*?(\/)?>/g;
  const blockCloseRe = /<\/block>/g;
  // Walk character by character, alternating which regex hits next.
  while (i < s.length) {
    blockOpenRe.lastIndex = i;
    blockCloseRe.lastIndex = i;
    const o = blockOpenRe.exec(s);
    const c = blockCloseRe.exec(s);
    if (!c) throw new Error('no closing </block> found');
    if (o && o.index < c.index) {
      // self-closing? <block .../>
      if (o[1] === '/') { /* self-close, no depth change */ }
      else depth++;
      i = o.index + o[0].length;
    } else {
      depth--;
      i = c.index + c[0].length;
      if (depth === 0) return i;
    }
  }
  throw new Error('unmatched <block>');
}

function inject(xml) {
  // 1. Add PeakProfit variable if not already present
  if (!xml.includes(`id="${PEAK_VAR_ID}"`)) {
    xml = xml.replace(
      '</variables>',
      `  <variable id="${PEAK_VAR_ID}">PeakProfit</variable>\n  </variables>`
    );
  }

  // 2. Locate after_purchase block and its AFTERPURCHASE_STACK statement
  const apIdx = xml.indexOf('<block type="after_purchase"');
  if (apIdx === -1) throw new Error('no after_purchase block');
  const stStart = xml.indexOf('<statement name="AFTERPURCHASE_STACK">', apIdx);
  if (stStart === -1) throw new Error('no AFTERPURCHASE_STACK statement');
  const stOpenEnd = stStart + '<statement name="AFTERPURCHASE_STACK">'.length;

  // 3. Find the first <block ...> child of that statement
  const firstBlockOpen = xml.indexOf('<block', stOpenEnd);
  if (firstBlockOpen === -1) throw new Error('no first block in AFTERPURCHASE_STACK');
  // Sanity: between stOpenEnd and firstBlockOpen should only be whitespace
  const between = xml.slice(stOpenEnd, firstBlockOpen);
  if (between.trim() !== '') throw new Error('unexpected content before first block: ' + JSON.stringify(between));

  // 4. Find matching </block> for that first block
  const firstBlockClose = findMatchingClose(xml, firstBlockOpen);
  const existing = xml.slice(firstBlockOpen, firstBlockClose);

  // 5. Build replacement: injected wrapper with existing chain plugged in
  const replacement = INJECT.replace('__EXISTING_FIRST_BLOCK__', existing);

  // 6. Splice
  return xml.slice(0, firstBlockOpen) + replacement + xml.slice(firstBlockClose);
}

let allOk = true;
for (const path of FILES) {
  try {
    let xml = fs.readFileSync(path, 'utf8');
    if (xml.includes('id="pl_peak_update"')) {
      console.log('SKIP (already injected):', path);
      continue;
    }
    const out = inject(xml);
    fs.writeFileSync(path, out);
    console.log('injected:', path, '(+' + (out.length - xml.length) + ' bytes)');
  } catch (e) {
    allOk = false;
    console.error('FAILED', path, e.message);
  }
}
process.exit(allOk ? 0 : 1);
