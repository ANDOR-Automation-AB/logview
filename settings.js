const PALETTE = [
  '#e74c3c', '#e67e22', '#f39c12', '#f1c40f', '#2ecc71',
  '#1abc9c', '#22d3ee', '#3498db', '#748ffc', '#9b59b6',
  '#74c0fc', '#51cf66', '#a9e34b', '#ffd43b', '#ffa94d',
  '#f783ac', '#cc5de8', '#d62728', '#888888', '#333333',
];

let columns = [];
let initializing = false;

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isAbsolutePath(p) {
  return /^\//.test(p) || /^[A-Za-z]:[\\\/]/.test(p);
}

function colOptions(selected) {
  return '<option value="">—</option>' +
    columns.map(c =>
      `<option value="${escHtml(c)}"${c === selected ? ' selected' : ''}>${escHtml(c)}</option>`
    ).join('');
}

function refreshColumnSelects() {
  document.querySelectorAll('.col-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = colOptions(cur);
  });
  const timeSel = document.getElementById('time-col');
  const curTime = timeSel.value;
  timeSel.innerHTML = '<option value="">— välj —</option>' +
    columns.map(c =>
      `<option value="${escHtml(c)}"${c === curTime ? ' selected' : ''}>${escHtml(c)}</option>`
    ).join('');
}

async function checkDb() {
  const db = document.getElementById('db-path').value.trim();
  const dbErr = document.getElementById('db-error');
  if (!isAbsolutePath(db)) {
    dbErr.textContent = 'Ange en absolut sökväg';
    return false;
  }
  dbErr.textContent = '';
  try {
    const r = await fetch('/tables?' + new URLSearchParams({ db }));
    const data = await r.json();
    if (data.error) { dbErr.textContent = 'Databasen hittades inte'; return false; }
    return true;
  } catch {
    dbErr.textContent = 'Databasen hittades inte';
    return false;
  }
}

async function loadColumns() {
  const db = document.getElementById('db-path').value.trim();
  const table = document.getElementById('table').value.trim();
  const tableErr = document.getElementById('table-error');
  if (!table) { tableErr.textContent = 'Ange tabell'; return false; }
  try {
    const r = await fetch('/columns?' + new URLSearchParams({ table, db }));
    const data = await r.json();
    if (data.error) { tableErr.textContent = 'Tabellen hittades inte'; return false; }
    tableErr.textContent = '';
    columns = data;
    refreshColumnSelects();
    return true;
  } catch {
    tableErr.textContent = 'Tabellen hittades inte';
    return false;
  }
}

function makeColorPicker(field, value) {
  const cur = PALETTE.includes(value) ? value : (value || '#888888');
  const wrapper = document.createElement('div');
  wrapper.className = 'color-picker';
  wrapper.dataset.field = field;
  wrapper.dataset.value = cur;

  const swatch = document.createElement('div');
  swatch.className = 'color-swatch';
  swatch.style.background = cur;

  const popup = document.createElement('div');
  popup.className = 'color-popup';

  PALETTE.forEach(color => {
    const dot = document.createElement('div');
    dot.className = 'color-dot' + (color === cur ? ' selected' : '');
    dot.style.background = color;
    dot.addEventListener('click', e => {
      e.stopPropagation();
      wrapper.dataset.value = color;
      swatch.style.background = color;
      popup.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      popup.classList.remove('open');
      autoSave();
    });
    popup.appendChild(dot);
  });

  swatch.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.color-popup.open').forEach(p => { if (p !== popup) p.classList.remove('open'); });
    popup.classList.toggle('open');
  });

  wrapper.appendChild(swatch);
  wrapper.appendChild(popup);
  return wrapper;
}

document.addEventListener('click', () => {
  document.querySelectorAll('.color-popup.open').forEach(p => p.classList.remove('open'));
});

function makeColSelect(field, value) {
  const sel = document.createElement('select');
  sel.className = 'col-select';
  sel.dataset.field = field;
  sel.innerHTML = colOptions(value || '');
  sel.addEventListener('change', autoSave);
  return sel;
}

// ── Band column management ──────────────────────────────────────────

function getBandCount() {
  return document.querySelectorAll('#header-top [data-band-idx]').length;
}

function addBandColumn() {
  const idx = getBandCount(); // capture before mutating header

  // header-top: insert new Band th before [+]
  const addTh = document.getElementById('btn-add-band-col');
  const bandTh = document.createElement('th');
  bandTh.colSpan = 3;
  bandTh.dataset.bandIdx = idx;
  const removeBtn = document.createElement('button');
  removeBtn.className = 'band-col-remove';
  removeBtn.dataset.idx = idx;
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeBandColumn(parseInt(removeBtn.dataset.idx));
  });
  bandTh.appendChild(removeBtn);
  bandTh.appendChild(document.createTextNode('Band'));
  document.getElementById('header-top').insertBefore(bandTh, addTh);

  // header-sub: insert Kolumn+Värde before the last 2 ths (Linje sub-headers)
  const subRow = document.getElementById('header-sub');
  const linjeRef = subRow.children[subRow.children.length - 2];
  const kolTh = document.createElement('th'); kolTh.textContent = 'Kolumn'; kolTh.className = 'th-band-start';
  const valTh = document.createElement('th'); valTh.textContent = 'Värde'; valTh.className = 'th-val';
  const txtTh = document.createElement('th'); txtTh.textContent = 'Text'; txtTh.className = 'th-band-text';
  subRow.insertBefore(kolTh, linjeRef);
  subRow.insertBefore(valTh, linjeRef);
  subRow.insertBefore(txtTh, linjeRef);

  // data rows: insert 3 cells before the [+] empty cell (index 3*idx + 3, after naam/gap/defaultText)
  document.querySelectorAll('#rows-body tr').forEach(tr => {
    const refCell = tr.cells[3 * idx + 3];

    const colTd = document.createElement('td');
    colTd.appendChild(makeColSelect('bandCol', ''));

    const valTd = document.createElement('td');
    valTd.className = 'td-val';
    const valInput = document.createElement('input');
    valInput.type = 'number';
    valInput.className = 'band-value';
    valInput.min = 1; valInput.max = 99; valInput.value = 1;
    valInput.addEventListener('change', autoSave);
    valTd.appendChild(valInput);

    const textTd = document.createElement('td');
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'band-text';
    textInput.placeholder = '—';
    textInput.addEventListener('blur', autoSave);
    textTd.appendChild(textInput);

    tr.insertBefore(colTd, refCell);
    tr.insertBefore(valTd, refCell);
    tr.insertBefore(textTd, refCell);
  });

  updateTfoot();
  if (!initializing) autoSave();
}

function removeBandColumn(idx) {
  // header-top
  const topRow = document.getElementById('header-top');
  const bandThs = [...topRow.querySelectorAll('[data-band-idx]')];
  bandThs[idx].remove();
  [...topRow.querySelectorAll('[data-band-idx]')].forEach((th, i) => {
    th.dataset.bandIdx = i;
    const btn = th.querySelector('.band-col-remove');
    if (btn) btn.dataset.idx = i;
  });

  // header-sub
  const subRow = document.getElementById('header-sub');
  const subs = [...subRow.children];
  subs[idx * 3].remove();
  subs[idx * 3 + 1].remove();
  subs[idx * 3 + 2].remove();

  // data rows: 3 cells starting at index 3 + idx*3 (after naam/gap/defaultText)
  document.querySelectorAll('#rows-body tr').forEach(tr => {
    const colIdx = 3 + idx * 3;
    tr.deleteCell(colIdx);
    tr.deleteCell(colIdx);
    tr.deleteCell(colIdx);
  });

  updateTfoot();
  autoSave();
}

function updateTfoot() {
  // 1 (Namn) + 1 (gap) + 1 (defaultText) + bc*3 (bands) + 1 ([+]) + 1 (gap) + 1 (Linje) + 1 (Färg) + 1 (gap) + 1 (Delete)
  const ftTd = document.querySelector('tfoot td');
  if (ftTd) ftTd.colSpan = getBandCount() * 3 + 9;
}

// ── Row rendering ───────────────────────────────────────────────────

function makeRowEl(row) {
  const tr = document.createElement('tr');
  const bc = getBandCount();

  // Namn
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.dataset.field = 'name';
  nameInput.value = row.name || '';
  nameInput.placeholder = 'Namn';
  nameInput.addEventListener('blur', autoSave);
  const nameTd = document.createElement('td');
  nameTd.appendChild(nameInput);
  tr.appendChild(nameTd);
  tr.appendChild(document.createElement('td')); // gap: Namn → defaultText

  // Default text
  const defaultTextInput = document.createElement('input');
  defaultTextInput.type = 'text';
  defaultTextInput.className = 'row-default-text';
  defaultTextInput.placeholder = '—';
  defaultTextInput.value = row.defaultText || '';
  defaultTextInput.addEventListener('blur', autoSave);
  const defaultTextTd = document.createElement('td');
  defaultTextTd.appendChild(defaultTextInput);
  tr.appendChild(defaultTextTd);

  // Band cells
  for (let i = 0; i < bc; i++) {
    const band = (row.bands || [])[i] || {};

    const colTd = document.createElement('td');
    colTd.appendChild(makeColSelect('bandCol', band.col || ''));
    tr.appendChild(colTd);

    const valTd = document.createElement('td');
    valTd.className = 'td-val';
    const valInput = document.createElement('input');
    valInput.type = 'number';
    valInput.className = 'band-value';
    valInput.min = 1; valInput.max = 99;
    valInput.value = band.value != null ? band.value : 1;
    valInput.addEventListener('change', autoSave);
    valTd.appendChild(valInput);
    tr.appendChild(valTd);

    const textTd = document.createElement('td');
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'band-text';
    textInput.placeholder = '—';
    textInput.value = band.text || '';
    textInput.addEventListener('blur', autoSave);
    textTd.appendChild(textInput);
    tr.appendChild(textTd);
  }

  // [+] empty cell
  tr.appendChild(document.createElement('td'));
  tr.appendChild(document.createElement('td')); // gap: [+] → Linje

  // Linje
  const linjeTd = document.createElement('td');
  linjeTd.appendChild(makeColSelect('lineCol', row.lineCol || ''));
  tr.appendChild(linjeTd);

  // Färg
  const colorTd = document.createElement('td');
  colorTd.appendChild(makeColorPicker('color', row.color));
  tr.appendChild(colorTd);
  tr.appendChild(document.createElement('td')); // gap: Linje → del

  // Delete
  const delTd = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.className = 'btn-del';
  delBtn.textContent = '×';
  delBtn.addEventListener('click', () => { tr.remove(); autoSave(); });
  delTd.appendChild(delBtn);
  tr.appendChild(delTd);

  return tr;
}

function getRowData(tr) {
  const bc = getBandCount();
  const nameEl        = tr.cells[0]?.querySelector('[data-field="name"]');
  const defaultTextEl = tr.cells[2]?.querySelector('.row-default-text');
  const linjeEl       = tr.cells[3 * bc + 5]?.querySelector('.col-select');
  const colorEl       = tr.cells[3 * bc + 6]?.querySelector('[data-field="color"]');

  const bands = [];
  for (let i = 0; i < bc; i++) {
    const col = tr.cells[3 + i * 3]?.querySelector('.col-select')?.value || null;
    const val = parseInt(tr.cells[4 + i * 3]?.querySelector('.band-value')?.value) || 1;
    const txt = tr.cells[5 + i * 3]?.querySelector('.band-text')?.value || '';
    if (col) bands.push({ col, value: val, ...(txt ? { text: txt } : {}) });
  }

  return {
    name:        nameEl        ? nameEl.value : '',
    defaultText: defaultTextEl ? (defaultTextEl.value || '') : '',
    bands,
    lineCol: linjeEl ? (linjeEl.value || null) : null,
    color:   colorEl ? (colorEl.dataset.value || '#888888') : '#888888',
  };
}

// ── Save ─────────────────────────────────────────────────────────────

function canSave() {
  const db = document.getElementById('db-path').value.trim();
  const table = document.getElementById('table').value.trim();
  const timeColumn = document.getElementById('time-col').value;
  if (!db || !isAbsolutePath(db)) return false;
  if (!table) return false;
  if (!timeColumn) return false;
  if (document.getElementById('db-error').textContent) return false;
  if (document.getElementById('table-error').textContent) return false;
  if (document.getElementById('time-col-error').textContent) return false;
  return true;
}

async function validateTimeCol() {
  const db = document.getElementById('db-path').value.trim();
  const table = document.getElementById('table').value.trim();
  const col = document.getElementById('time-col').value;
  const err = document.getElementById('time-col-error');
  if (!col) { err.textContent = ''; return; }
  try {
    const r = await fetch('/sample?' + new URLSearchParams({ table, column: col, db }));
    const data = await r.json();
    if (data.error || data.value === null) { err.textContent = ''; return; }
    if (isNaN(Date.parse(String(data.value)))) {
      err.textContent = 'Kolumnen innehåller inte datum/tid';
    } else {
      err.textContent = '';
    }
  } catch {
    err.textContent = '';
  }
}

async function autoSave() {
  if (initializing || !canSave()) return;
  const rows = [...document.querySelectorAll('#rows-body tr')]
    .map(getRowData)
    .filter(r => r.name.trim() || r.bands.length > 0 || r.lineCol);
  const settings = {
    db: document.getElementById('db-path').value.trim(),
    table: document.getElementById('table').value.trim(),
    timeColumn: document.getElementById('time-col').value,
    rows,
  };
  try {
    const r = await fetch('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const data = await r.json();
    if (data.error) document.getElementById('db-error').textContent = `Kunde inte spara: ${data.error}`;
  } catch (e) {
    document.getElementById('db-error').textContent = 'Kunde inte spara inställningar';
  }
}

// ── Init ─────────────────────────────────────────────────────────────

async function init() {
  initializing = true;

  const r = await fetch('/settings');
  const settings = await r.json();

  document.getElementById('db-path').value = settings.db || '';
  document.getElementById('table').value = settings.table || '';

  await loadColumns();

  const timeSel = document.getElementById('time-col');
  if (columns.includes(settings.timeColumn)) timeSel.value = settings.timeColumn;

  // Set up band columns based on widest row
  const maxBands = Math.max(0, ...(settings.rows || []).map(r => (r.bands || []).length));
  for (let i = 0; i < maxBands; i++) addBandColumn();
  updateTfoot();

  const tbody = document.getElementById('rows-body');
  (settings.rows || []).forEach(row => tbody.appendChild(makeRowEl(row)));

  initializing = false;
}

// ── Event listeners ──────────────────────────────────────────────────

document.getElementById('db-path').addEventListener('blur', async () => {
  const ok = await checkDb();
  if (ok) await loadColumns();
  autoSave();
});

document.getElementById('table').addEventListener('blur', async () => {
  await loadColumns();
  autoSave();
});

document.getElementById('time-col').addEventListener('change', async () => {
  await validateTimeCol();
  autoSave();
});

document.getElementById('btn-add-band-col').addEventListener('click', addBandColumn);

document.getElementById('btn-add').addEventListener('click', () => {
  document.getElementById('rows-body').appendChild(makeRowEl({}));
  autoSave();
});

init();
