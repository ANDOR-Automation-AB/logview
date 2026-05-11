fetch('/settings')
  .then(r => r.json())
  .then(settings => {
    const PUMPS = settings.rows
      .filter(r => r.bands && r.bands.some(b => b.col))
      .map(r => ({ label: r.name, bands: r.bands.filter(b => b.col), defaultText: r.defaultText || '' }));

    const LEVELS = settings.rows
      .filter(r => r.lineCol)
      .map(r => ({ label: r.name, col: r.lineCol, color: r.color }));

    function pumpState(row, pump) {
      for (const b of pump.bands) {
        if (row[b.col]) return b.value;
      }
      return 0;
    }

    function pumpText(row, pump) {
      for (const b of pump.bands) {
        if (row[b.col]) return b.text || String(b.value);
      }
      return pump.defaultText || '—';
    }

    const levelColorMap = Object.fromEntries(LEVELS.map(l => [l.label, l.color]));

    fetch('/data')
      .then(r => r.json())
      .then(initialRows => {
        let rows = initialRows;
        let times = rows.map(r => r[settings.timeColumn]);

        // Normaliserat mot zmin=-3, zmax=2 (range=5):
        //   Dold:  2→-3 (0.0, mörkgrå), 1→-2 (0.2, mellangrå), 0→-1 (0.4, ljusgrå)
        //   Aktiv: 0→0.6 (röd), 1→0.8 (gul), 2→1.0 (grön)
        //   Gränsen grå↔röd ligger vid 0.59→0.60, långt från alla faktiska z-värden.
        let zData = PUMPS.map(p => rows.map(r => pumpState(r, p)));
        let textData = PUMPS.map(p => rows.map(r => pumpText(r, p)));

        Plotly.newPlot('bands', [{
          type: 'heatmap',
          x: times,
          y: PUMPS.map(p => p.label),
          z: zData,
          colorscale: [
            [0.000, '#555'], [0.195, '#555'],  // z=-3: mörkgrå (kör → dold)
            [0.200, '#999'], [0.395, '#999'],  // z=-2: mellangrå (pause → dold)
            [0.400, '#ccc'], [0.590, '#ccc'],  // z=-1: ljusgrå (stopp → dold)
            [0.600, '#e74c3c'], [0.795, '#e74c3c'],  // z=0: röd (stopp)
            [0.800, '#f1c40f'], [0.995, '#f1c40f'],  // z=1: gul (pause)
            [1.000, '#2ecc71'],                       // z=2: grön (kör)
          ],
          zmin: -3, zmax: 2,
          showscale: false,
          xgap: 0, ygap: 2,
          customdata: textData,
          hovertemplate: '%{x}<br>%{y}<br>%{customdata}<extra></extra>',
        }], {
          margin: { t: 5, r: 0, b: 0, l: 80 },
          dragmode: 'pan',
          yaxis: { autorange: 'reversed', showticklabels: false, fixedrange: true },
          xaxis: { showticklabels: false },
          paper_bgcolor: '#f5f0e8',
          plot_bgcolor: '#ede8dc',
          font: { color: '#2c2c2c' },
          height: 280,
          shapes: PUMPS
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => levelColorMap[p.label])
            .map(({ p, i }) => ({
              type: 'rect',
              xref: 'paper',
              yref: 'y',
              x0: -2, x1: 0,
              y0: i - 0.45, y1: i + 0.45,
              fillcolor: levelColorMap[p.label],
              line: { width: 0 },
              layer: 'above',
            })),
          annotations: PUMPS.map(p => ({
            x: 0, y: p.label,
            xref: 'paper', yref: 'y',
            text: p.label,
            showarrow: false,
            font: { color: '#000', size: 11 },
            xanchor: 'center',
            xshift: -40,
            captureevents: !!levelColorMap[p.label],
          })),
        }, { responsive: true, displayModeBar: false, doubleClick: false });

        Plotly.newPlot('chart', LEVELS.map(l => ({
          type: 'scatter',
          mode: 'lines',
          name: l.label,
          x: times,
          y: rows.map(r => r[l.col]),
          line: { color: l.color, width: 1.5 },
          hovertemplate: `%{x}<br>%{y}<extra>${l.label}</extra>`,
        })), {
          margin: { t: 0, r: 0, b: 60, l: 80 },
          paper_bgcolor: '#f5f0e8',
          plot_bgcolor: '#ede8dc',
          font: { color: '#2c2c2c' },
          dragmode: 'pan',
          xaxis: { gridcolor: '#d4cfc5', tickfont: { size: 11 } },
          yaxis: { gridcolor: '#d4cfc5', autorange: true, fixedrange: true },
          showlegend: false,
        }, { responsive: true, displayModeBar: false, doubleClick: false });

        // X-axel sync
        let lastRange = null;

        function rangeKey(r0, r1) { return r0 + '|' + r1; }

        function parseDateStr(s) {
          const n = String(s).replace('T', ' ');
          return { date: n.slice(0, 10), time: n.slice(11, 16) };
        }

        function syncRangePickers(r0, r1) {
          const p0 = parseDateStr(r0), p1 = parseDateStr(r1);
          document.getElementById('range-start-date').value = p0.date;
          document.getElementById('range-start-time').value = p0.time.slice(0, 2);
          document.getElementById('range-end-date').value = p1.date;
          document.getElementById('range-end-time').value = p1.time.slice(0, 2);
        }

        document.getElementById('bands').on('plotly_relayout', evt => {
          if (evt['xaxis.range[0]'] === undefined) return;
          const key = rangeKey(evt['xaxis.range[0]'], evt['xaxis.range[1]']);
          if (key === lastRange) return;
          lastRange = key;
          syncRangePickers(evt['xaxis.range[0]'], evt['xaxis.range[1]']);
          updateDrButtons();
          if (!autoUpdating) deactivateAuto();
          Plotly.relayout('chart', { 'xaxis.range[0]': evt['xaxis.range[0]'], 'xaxis.range[1]': evt['xaxis.range[1]'] });
        });

        document.getElementById('chart').on('plotly_relayout', evt => {
          if (evt['xaxis.range[0]'] === undefined) return;
          const key = rangeKey(evt['xaxis.range[0]'], evt['xaxis.range[1]']);
          if (key === lastRange) return;
          lastRange = key;
          syncRangePickers(evt['xaxis.range[0]'], evt['xaxis.range[1]']);
          updateDrButtons();
          if (!autoUpdating) deactivateAuto();
          Plotly.relayout('bands', { 'xaxis.range[0]': evt['xaxis.range[0]'], 'xaxis.range[1]': evt['xaxis.range[1]'] });
        });

        function bothCharts(update) {
          lastRange = null;
          Promise.all([
            Plotly.relayout('bands', update),
            Plotly.relayout('chart', update),
          ]);
        }

        function setMode(mode) {
          bothCharts({ dragmode: mode });
          document.querySelectorAll('#btn-zoom, #btn-pan').forEach(b => b.classList.remove('active'));
          document.getElementById('btn-' + mode).classList.add('active');
        }

        function zoomX(factor) {
          const range = document.getElementById('chart').layout.xaxis.range;
          if (!range) return;
          const t0 = Date.parse(range[0]);
          const t1 = Date.parse(range[1]);
          const mid = (t0 + t1) / 2;
          const half = (t1 - t0) / 2 * factor;
          const r0 = new Date(mid - half).toISOString();
          const r1 = new Date(mid + half).toISOString();
          deactivateAuto();
          bothCharts({ 'xaxis.range': [r0, r1] });
          syncRangePickers(r0, r1);
          updateRangeHints();
          updateDrButtons();
        }

        // Init date range pickers from data extent
        syncRangePickers(times[0], times[times.length - 1]);

        const dataStart = parseDateStr(times[0]);
        const dataEnd   = parseDateStr(times[times.length - 1]);
        const sdEl = document.getElementById('range-start-date');
        const stEl = document.getElementById('range-start-time');
        const edEl = document.getElementById('range-end-date');
        const etEl = document.getElementById('range-end-time');
        sdEl.min = dataStart.date; sdEl.max = dataEnd.date;
        edEl.min = dataStart.date; edEl.max = dataEnd.date;
        const dataStartH = parseInt(dataStart.time.slice(0, 2));
        const dataEndH   = parseInt(dataEnd.time.slice(0, 2));

        function updateRangeHints() {
          sdEl.classList.toggle('hint-out', sdEl.value < dataStart.date || sdEl.value > dataEnd.date);
          edEl.classList.toggle('hint-out', edEl.value < dataStart.date || edEl.value > dataEnd.date);
          const sh = parseInt(stEl.value);
          const eh = parseInt(etEl.value);
          stEl.classList.toggle('hint-out', sdEl.value === dataStart.date && !isNaN(sh) && sh < dataStartH);
          etEl.classList.toggle('hint-out', edEl.value === dataEnd.date   && !isNaN(eh) && eh > dataEndH);
          stEl.parentElement.querySelectorAll('.hp-item').forEach(item => {
            item.classList.toggle('hint-out', sdEl.value === dataStart.date && parseInt(item.dataset.h) < dataStartH);
          });
          etEl.parentElement.querySelectorAll('.hp-item').forEach(item => {
            item.classList.toggle('hint-out', edEl.value === dataEnd.date && parseInt(item.dataset.h) > dataEndH);
          });
        }

        function parseHour(s) {
          const h = parseInt(String(s).trim());
          return (isNaN(h) || h < 0 || h > 23) ? '00' : String(h).padStart(2, '0');
        }

        function applyDateRange() {
          const sd = sdEl.value, ed = edEl.value;
          if (!sd || !ed) return;
          deactivateAuto();
          updateRangeHints();
          updateDrButtons();
          bothCharts({ 'xaxis.range': [
            `${sd} ${parseHour(stEl.value)}:00`,
            `${ed} ${parseHour(etEl.value)}:00`,
          ]});
        }

        function addDay(dateStr, n) {
          const d = new Date(dateStr + 'T00:00:00');
          d.setDate(d.getDate() + n);
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        }

        function stepHour(dateEl, timeEl, dir) {
          const h = parseInt(timeEl.value);
          if (dir > 0 && h === 23) { dateEl.value = addDay(dateEl.value, 1); timeEl.value = '00'; }
          else if (dir < 0 && h === 0) { dateEl.value = addDay(dateEl.value, -1); timeEl.value = '23'; }
          else timeEl.value = String(h + dir).padStart(2, '0');
        }

        function updateDrButtons() {
          const sMs = new Date(`${sdEl.value}T${parseHour(stEl.value)}:00:00`).getTime();
          const eMs = new Date(`${edEl.value}T${parseHour(etEl.value)}:00:00`).getTime();
          const dsMs = new Date(`${dataStart.date}T${String(dataStartH).padStart(2,'0')}:00:00`).getTime();
          const deMs = new Date(`${dataEnd.date}T${String(dataEndH).padStart(2,'0')}:00:00`).getTime();
          document.getElementById('btn-sd-dec').disabled = sMs <= dsMs;
          document.getElementById('btn-sd-inc').disabled = sMs >= deMs;
          document.getElementById('btn-st-dec').disabled = sMs <= dsMs;
          document.getElementById('btn-st-inc').disabled = sMs >= deMs;
          document.getElementById('btn-ed-dec').disabled = eMs <= dsMs;
          document.getElementById('btn-ed-inc').disabled = eMs >= deMs;
          document.getElementById('btn-et-dec').disabled = eMs <= dsMs;
          document.getElementById('btn-et-inc').disabled = eMs >= deMs;
        }

        function setupHourPicker(inputEl) {
          const dropdown = inputEl.parentElement.querySelector('.hp-dropdown');
          for (let h = 0; h < 24; h++) {
            const item = document.createElement('div');
            item.className = 'hp-item';
            item.dataset.h = h;
            item.textContent = String(h).padStart(2, '0');
            item.addEventListener('mousedown', e => {
              e.preventDefault();
              inputEl.value = item.textContent;
              dropdown.classList.remove('open');
              applyDateRange();
            });
            dropdown.appendChild(item);
          }
          inputEl.addEventListener('focus', () => {
            inputEl._saved = inputEl.value;
            inputEl.value = '';
            dropdown.classList.add('open');
          });
          inputEl.addEventListener('blur', () => {
            dropdown.classList.remove('open');
            if (!inputEl.value) inputEl.value = inputEl._saved || '00';
          });
          inputEl.addEventListener('change', applyDateRange);
        }

        setupHourPicker(stEl);
        setupHourPicker(etEl);
        updateRangeHints();
        updateDrButtons();
        [sdEl, edEl].forEach(el => el.addEventListener('change', applyDateRange));

        function shiftRange(dir) {
          const dayDiff = Math.round((new Date(edEl.value + 'T12:00:00') - new Date(sdEl.value + 'T12:00:00')) / 86400000);
          const totalHours = dayDiff * 24 + (parseInt(etEl.value) || 0) - (parseInt(stEl.value) || 0);
          const applyHours = (dateEl, timeEl, n) => {
            const h = (parseInt(timeEl.value) || 0) + n;
            const days = Math.floor(h / 24);
            timeEl.value = String(((h % 24) + 24) % 24).padStart(2, '0');
            if (days !== 0) dateEl.value = addDay(dateEl.value, days);
          };
          applyHours(sdEl, stEl, dir * totalHours);
          applyHours(edEl, etEl, dir * totalHours);
          applyDateRange();
        }

        document.getElementById('btn-shift-back').addEventListener('click', () => shiftRange(-1));
        document.getElementById('btn-shift-fwd').addEventListener('click', () => shiftRange(1));

        document.getElementById('btn-sd-dec').addEventListener('click', () => { sdEl.value = addDay(sdEl.value, -1); applyDateRange(); });
        document.getElementById('btn-sd-inc').addEventListener('click', () => { sdEl.value = addDay(sdEl.value, 1); applyDateRange(); });
        document.getElementById('btn-st-dec').addEventListener('click', () => { stepHour(sdEl, stEl, -1); applyDateRange(); });
        document.getElementById('btn-st-inc').addEventListener('click', () => { stepHour(sdEl, stEl, 1); applyDateRange(); });
        document.getElementById('btn-ed-dec').addEventListener('click', () => { edEl.value = addDay(edEl.value, -1); applyDateRange(); });
        document.getElementById('btn-ed-inc').addEventListener('click', () => { edEl.value = addDay(edEl.value, 1); applyDateRange(); });
        document.getElementById('btn-et-dec').addEventListener('click', () => { stepHour(edEl, etEl, -1); applyDateRange(); });
        document.getElementById('btn-et-inc').addEventListener('click', () => { stepHour(edEl, etEl, 1); applyDateRange(); });

        document.getElementById('btn-reset').addEventListener('click', () => {
          deactivateAuto();
          lastRange = null;
          Promise.all([
            Plotly.relayout('bands', { 'xaxis.autorange': true }),
            Plotly.relayout('chart', { 'xaxis.autorange': true }),
          ]).then(() => {
            const range = document.getElementById('chart').layout.xaxis.range;
            if (range) { syncRangePickers(range[0], range[1]); updateRangeHints(); updateDrButtons(); }
          });
        });
        document.getElementById('btn-zoom').addEventListener('click', () => setMode('zoom'));
        document.getElementById('btn-pan').addEventListener('click', () => setMode('pan'));
        document.getElementById('btn-zoomin').addEventListener('click', () => zoomX(0.5));
        document.getElementById('btn-zoomout').addEventListener('click', () => zoomX(2));

        const hidden = new Set();
        const clickablePumps = PUMPS.filter(p => levelColorMap[p.label]);
        const shapeIdxMap = Object.fromEntries(clickablePumps.map((p, i) => [p.label, i]));

        function togglePump(label) {
          const traceIdx = LEVELS.findIndex(l => l.label === label);
          if (traceIdx === -1) return;
          deactivateAuto();

          hidden.has(label) ? hidden.delete(label) : hidden.add(label);
          const isNowHidden = hidden.has(label);
          const pumpIdx = PUMPS.findIndex(p => p.label === label);
          const shapeIdx = shapeIdxMap[label];

          zData[pumpIdx] = isNowHidden
            ? rows.map(r => -(pumpState(r, PUMPS[pumpIdx]) + 1))
            : rows.map(r => pumpState(r, PUMPS[pumpIdx]));

          textData[pumpIdx] = isNowHidden
            ? rows.map(() => 'Dold')
            : rows.map(r => pumpText(r, PUMPS[pumpIdx]));
          Plotly.restyle('bands', { z: [zData], customdata: [textData] }, [0]);
          Plotly.restyle('chart', { visible: !isNowHidden }, [traceIdx]);
          Plotly.relayout('bands', {
            [`shapes[${shapeIdx}].fillcolor`]: isNowHidden ? '#bbb' : levelColorMap[label],
            [`annotations[${pumpIdx}].font.color`]: isNowHidden ? '#444' : '#000',
          });
        }

        const bandsEl = document.getElementById('bands');

        bandsEl.addEventListener('click', evt => {
          const fl = bandsEl._fullLayout;
          if (!fl) return;
          const rect = bandsEl.getBoundingClientRect();
          const x = evt.clientX - rect.left;
          const y = evt.clientY - rect.top;
          if (x >= fl.margin.l) return;
          const plotHeight = fl.height - fl.margin.t - fl.margin.b;
          const yFrac = (y - fl.margin.t) / plotHeight;
          const pumpIdx = Math.max(0, Math.min(PUMPS.length - 1, Math.floor(yFrac * PUMPS.length)));
          const pump = PUMPS[pumpIdx];
          if (levelColorMap[pump.label]) togglePump(pump.label);
        });

        bandsEl.addEventListener('mousemove', evt => {
          const fl = bandsEl._fullLayout;
          if (!fl) return;
          const x = evt.clientX - bandsEl.getBoundingClientRect().left;
          bandsEl.style.cursor = x < fl.margin.l ? 'pointer' : '';
        });

        // Auto mode
        let autoMode = true;
        let autoInterval = null;
        let idleTimeout = null;
        let countdownInterval = null;
        let autoUpdating = false;

        function deactivateAuto() {
          if (autoMode) {
            autoMode = false;
            document.getElementById('btn-auto').classList.remove('active');
            clearInterval(autoInterval);
            autoInterval = null;
          }
          resetIdleTimer();
        }

        function activateAuto() {
          autoMode = true;
          document.getElementById('btn-auto').classList.add('active');
          clearTimeout(idleTimeout);
          idleTimeout = null;
          startAutoPolling();
        }

        function resetIdleTimer() {
          if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            document.getElementById('auto-countdown').classList.add('hidden');
          }
          clearTimeout(idleTimeout);
          idleTimeout = setTimeout(startCountdown, 60000);
        }

        function startCountdown() {
          let secs = 10;
          document.getElementById('auto-countdown-secs').textContent = secs;
          document.getElementById('auto-countdown').classList.remove('hidden');
          countdownInterval = setInterval(() => {
            secs--;
            document.getElementById('auto-countdown-secs').textContent = secs;
            if (secs <= 0) {
              clearInterval(countdownInterval);
              countdownInterval = null;
              document.getElementById('auto-countdown').classList.add('hidden');
              activateAuto();
            }
          }, 1000);
        }

        function startAutoPolling() {
          clearInterval(autoInterval);
          doAutoUpdate();
          autoInterval = setInterval(doAutoUpdate, 60000);
        }

        async function doAutoUpdate() {
          autoUpdating = true;
          try {
            const newRows = await fetch('/data').then(r => r.json());
            rows = newRows;
            times = newRows.map(r => r[settings.timeColumn]);
            zData = PUMPS.map(p => {
              const vals = newRows.map(r => pumpState(r, p));
              return hidden.has(p.label) ? vals.map(v => -(v + 1)) : vals;
            });
            textData = PUMPS.map(p => {
              const texts = newRows.map(r => pumpText(r, p));
              return hidden.has(p.label) ? texts.map(() => 'Dold') : texts;
            });
            Plotly.restyle('bands', { x: [times], z: [zData], customdata: [textData] }, [0]);
            Plotly.restyle('chart', {
              x: LEVELS.map(() => times),
              y: LEVELS.map(l => newRows.map(r => r[l.col])),
            }, LEVELS.map((_, i) => i));
            if (times.length > 0) {
              const last = String(times[times.length - 1]);
              const endD = new Date(last.replace(' ', 'T'));
              const startD = new Date(endD.getTime() - 3600000);
              const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
              const r0 = fmt(startD), r1 = fmt(endD);
              lastRange = null;
              await Promise.all([
                Plotly.relayout('bands', { 'xaxis.range': [r0, r1] }),
                Plotly.relayout('chart', { 'xaxis.range': [r0, r1] }),
              ]);
              syncRangePickers(r0, r1);
              updateRangeHints();
              updateDrButtons();
            }
          } catch (e) {
            console.error('Auto update failed:', e);
          } finally {
            autoUpdating = false;
          }
        }

        document.addEventListener('mousemove', () => { if (!autoMode) resetIdleTimer(); });
        document.addEventListener('keydown', () => { if (!autoMode) resetIdleTimer(); });
        document.getElementById('btn-auto').addEventListener('click', () => {
          autoMode ? deactivateAuto() : activateAuto();
        });

        startAutoPolling();
      });
  });
