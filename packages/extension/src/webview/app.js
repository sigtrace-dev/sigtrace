(function () {
  const vscode = acquireVsCodeApi();

  // ── State ────────────────────────────────────────────────────────────────
  const nodeMap = new Map();       // id -> node
  const componentMap = new Map();  // componentName -> comp stats
  let chainLog = [];               // finalized causal chains (newest first)
  let alerts = [];
  let activeChain = null;
  let chainFlushTimer = null;
  const CHAIN_FLUSH_MS = 120;
  let isRecording = true;
  let showInactive = false;
  let sortBy = 'updates';
  let focusedSignalId = null;
  let pendingTableRender = false;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const activityTableBody = document.getElementById('activity-table-body');
  const timelineChainList = document.getElementById('timeline-chain-list');
  const componentsPanel   = document.getElementById('components-panel');
  const alertsSection     = document.getElementById('alerts-section');
  const alertsPanel       = document.getElementById('alerts-panel');
  const alertBadge        = document.getElementById('alert-badge');
  const searchBar         = document.getElementById('search-bar');
  const inactiveToggle    = document.getElementById('inactive-toggle');
  const sortSelect        = document.getElementById('sort-select');
  const btnRecord         = document.getElementById('btn-record');
  const btnClear          = document.getElementById('btn-clear');

  // ── Tab switching ────────────────────────────────────────────────────────
  function activateTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector('[data-tab="' + tabId + '"]');
    if (btn) btn.classList.add('active');
    const pane = document.getElementById(tabId);
    if (pane) pane.classList.add('active');
    if (tabId === 'tab-activity') renderActivityTable();
    if (tabId === 'tab-timeline') renderTimeline();
    if (tabId === 'tab-components') renderComponentCards();
  }

  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { activateTab(btn.dataset.tab); });
  });

  // ── Event processing ─────────────────────────────────────────────────────
  function processEvent(msg) {
    if (!isRecording && msg.type !== 'register') return;

    switch (msg.type) {
      case 'register': {
        if (!nodeMap.has(msg.id)) {
          var node = {
            id: msg.id,
            name: cleanName(msg.name || msg.id),
            component: msg.component || 'Global',
            kind: msg.kind || 'signal',
            value: msg.value,
            epoch: 0,
            duration: 0,
            lastUpdated: null,
            sparkline: []
          };
          nodeMap.set(msg.id, node);
          ensureComponent(node);
        }
        break;
      }
      case 'write': {
        var node = nodeMap.get(msg.id);
        if (!node) {
          node = { id: msg.id, name: 'Unknown (' + msg.id + ')', component: 'Global', kind: 'signal', value: undefined, epoch: 0, lastUpdated: 0, sparkline: [] };
          nodeMap.set(msg.id, node);
          ensureComponent(node);
        }
        if (node) {
          var prev = node.value;
          node.value = msg.value;
          node.epoch++;
          node.lastUpdated = Date.now();
          node.sparkline.push(Date.now());
          if (node.sparkline.length > 20) node.sparkline.shift();
          bumpComponent(node);
          startChain(node, prev);
          scheduleTableRender();
        }
        break;
      }
      case 'update': {
        var node = nodeMap.get(msg.id);
        if (!node) {
          node = { id: msg.id, name: 'Unknown (' + msg.id + ')', component: 'Global', kind: 'computed', value: undefined, epoch: 0, lastUpdated: 0, sparkline: [] };
          nodeMap.set(msg.id, node);
          ensureComponent(node);
        }
        if (node) {
          if (msg.value !== undefined) node.value = msg.value;
          node.epoch++;
          node.duration = msg.duration || 0;
          node.lastUpdated = Date.now();
          node.sparkline.push(Date.now());
          if (node.sparkline.length > 20) node.sparkline.shift();
          bumpComponent(node);
          extendChain(node);
          scheduleTableRender();
        }
        break;
      }
      case 'destroy': {
        nodeMap.delete(msg.id);
        break;
      }
    }
  }

  // debounce table re-render so rapid bursts don't freeze
  function scheduleTableRender() {
    if (pendingTableRender) return;
    pendingTableRender = true;
    requestAnimationFrame(function() {
      pendingTableRender = false;
      var activeTab = document.querySelector('.tab-content.active');
      if (!activeTab) return;
      if (activeTab.id === 'tab-activity') renderActivityTable();
    });
  }

  // ── Name cleaning ─────────────────────────────────────────────────────────
  function cleanName(name) {
    // "computed_line120" -> keep as-is for now; future AST fix will improve this
    return name;
  }

  function shortComponentName(name) {
    return name.replace('Component', '').replace('Service', 'Svc');
  }

  // ── Component tracking ────────────────────────────────────────────────────
  function ensureComponent(node) {
    if (!componentMap.has(node.component)) {
      componentMap.set(node.component, {
        name: node.component,
        signals: 0, memos: 0, effects: 0,
        totalUpdates: 0,
        slowestNode: null, slowestMs: 0,
        mostActiveNode: null, mostActiveCount: 0
      });
    }
    var comp = componentMap.get(node.component);
    if (node.kind === 'signal') comp.signals++;
    else if (node.kind === 'memo') comp.memos++;
    else if (node.kind === 'effect') comp.effects++;
  }

  function bumpComponent(node) {
    var comp = componentMap.get(node.component);
    if (!comp) return;
    comp.totalUpdates++;
    if (node.duration > comp.slowestMs) {
      comp.slowestMs = node.duration;
      comp.slowestNode = node;
    }
    if (node.epoch > comp.mostActiveCount) {
      comp.mostActiveCount = node.epoch;
      comp.mostActiveNode = node;
    }
  }

  // ── Causal chain building ─────────────────────────────────────────────────
  function startChain(node, previousValue) {
    if (activeChain) finalizeChain();
    activeChain = {
      id: 'chain_' + Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      trigger: {
        id: node.id,
        name: node.name,
        component: node.component,
        value: node.value,
        previousValue: previousValue
      },
      updates: []
    };
    resetChainTimer();
  }

  function extendChain(node) {
    if (!activeChain) return;
    activeChain.updates.push({
      id: node.id,
      name: node.name,
      component: node.component,
      kind: node.kind,
      duration: node.duration,
      value: node.value
    });
    resetChainTimer();
  }

  function resetChainTimer() {
    clearTimeout(chainFlushTimer);
    chainFlushTimer = setTimeout(finalizeChain, CHAIN_FLUSH_MS);
  }

  function finalizeChain() {
    if (!activeChain) return;
    chainLog.unshift(activeChain);
    if (chainLog.length > 60) chainLog.pop();
    activeChain = null;
    var activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-timeline') renderTimeline();
  }

  // ── Activity table ────────────────────────────────────────────────────────
  function renderActivityTable() {
    var query = searchBar.value.trim().toLowerCase();
    var rows = Array.from(nodeMap.values());

    if (!showInactive) {
      rows = rows.filter(function(n) { return n.epoch > 0; });
    }

    if (query) {
      rows = rows.filter(function(n) {
        return n.name.toLowerCase().indexOf(query) !== -1 ||
               n.component.toLowerCase().indexOf(query) !== -1;
      });
    }

    if (sortBy === 'updates') rows.sort(function(a, b) { return b.epoch - a.epoch; });
    else if (sortBy === 'name') rows.sort(function(a, b) { return a.name.localeCompare(b.name); });
    else if (sortBy === 'component') rows.sort(function(a, b) { return a.component.localeCompare(b.component); });
    else if (sortBy === 'recent') rows.sort(function(a, b) { return (b.lastUpdated || 0) - (a.lastUpdated || 0); });

    if (rows.length === 0) {
      var msg = !showInactive
        ? 'No active signals yet.<br>Interact with your app or enable <strong>Show inactive</strong> to see all registered signals.'
        : 'No signals found' + (query ? ' matching <strong>' + query + '</strong>' : '') + '.';
      activityTableBody.innerHTML = '<tr class="empty-row"><td colspan="5">' + msg + '</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var node = rows[i];
      var valueStr = safeStr(node.value, 42);

      var timeStr = node.lastUpdated ? timeSince(node.lastUpdated) : 'never';
      var kindIcon = node.kind === 'signal' ? '&#9679;' : node.kind === 'memo' ? '&#9670;' : '&#9650;';
      var kindClass = 'kind-' + node.kind;
      var isHot = node.epoch > 30;
      var isFocused = node.id === focusedSignalId;
      var actBar = renderSparkBar(node.sparkline, node.epoch);
      var compShort = shortComponentName(node.component);

      html += '<tr class="signal-row' + (isHot ? ' row-hot' : '') + (isFocused ? ' row-focused' : '') + '" data-id="' + node.id + '">' +
        '<td class="col-name"><span class="kind-icon ' + kindClass + '">' + kindIcon + '</span><span class="signal-name" title="' + node.name + '">' + node.name + '</span></td>' +
        '<td class="col-component" title="' + node.component + '">' + compShort + '</td>' +
        '<td class="col-value" title="' + valueStr + '">' + valueStr + '</td>' +
        '<td class="col-updates' + (isHot ? ' hot-count' : '') + '">' + node.epoch + '</td>' +
        '<td class="col-activity">' + actBar + '</td>' +
        '</tr>';
    }
    activityTableBody.innerHTML = html;

    activityTableBody.querySelectorAll('.signal-row').forEach(function(row) {
      row.addEventListener('click', function() {
        focusedSignalId = row.dataset.id;
        renderActivityTable();
      });
    });
  }

  function renderSparkBar(sparkline, total) {
    if (total === 0) return '<span class="spark-zero">&#8212;</span>';
    var recentCount = sparkline.filter(function(t) { return Date.now() - t < 5000; }).length;
    var intensity = Math.min(1, recentCount / 5);
    var width = Math.max(4, Math.round(intensity * 64));
    var hue = Math.round(120 - intensity * 120);
    return '<div class="spark-bar-wrap"><div class="spark-bar" style="width:' + width + 'px;background:hsl(' + hue + ',75%,52%)"></div></div>';
  }

  function timeSince(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 2) return 'just now';
    if (s < 60) return s + 's ago';
    return Math.round(s / 60) + 'm ago';
  }

  function safeStr(val, max) {
    if (val === undefined) return 'undefined';
    if (typeof val === 'function') return 'function() {...}';
    var s = '';
    try {
      var j = JSON.stringify(val);
      s = (j === undefined) ? String(val) : j;
    } catch(e) { s = String(val); }
    if (!s || s === 'undefined') return '—';
    return s.length > max ? s.substring(0, max) + '...' : s;
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  function renderTimeline() {
    if (chainLog.length === 0) {
      timelineChainList.innerHTML = '<div class="empty-state">No activity yet.<br>Interact with your app to see causal chains appear here.</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < chainLog.length; i++) {
      var chain = chainLog[i];
      var d = new Date(chain.timestamp);
      var timeStr = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0');
      var totalEffects = chain.updates.filter(function(u) { return u.kind === 'effect'; }).length;
      var totalMemos   = chain.updates.filter(function(u) { return u.kind === 'memo'; }).length;
      var totalMs      = chain.updates.reduce(function(s, u) { return s + (u.duration || 0); }, 0);
      var summaryParts = [];
      if (totalMemos > 0) summaryParts.push(totalMemos + ' computed');
      if (totalEffects > 0) summaryParts.push(totalEffects + ' effect' + (totalEffects > 1 ? 's' : ''));
      if (totalMs > 0.1) summaryParts.push(totalMs.toFixed(1) + 'ms');
      var summaryStr = summaryParts.join(' &middot; ');

      var prevStr = safeStr(chain.trigger.previousValue, 20);
      var newStr  = safeStr(chain.trigger.value, 25);
      var valChange = prevStr ? prevStr + ' &rarr; ' + newStr : newStr;

      var updatesHtml = '';
      for (var j = 0; j < chain.updates.length; j++) {
        var u = chain.updates[j];
        var uKindIcon = u.kind === 'memo' ? '&#9670;' : '&#9650;';
        var uKindLabel = u.kind === 'memo' ? 'computed' : 'effect';
        var durStr = u.duration > 0 ? '(' + u.duration.toFixed(1) + 'ms)' : '';
        var isUHot = u.duration > 2;
        updatesHtml += '<div class="chain-update' + (isUHot ? ' chain-hot' : '') + '">' +
          '<span class="chain-indent">&#9492;&#9472;</span>' +
          '<span class="chain-icon kind-' + u.kind + '">' + uKindIcon + '</span>' +
          '<span class="chain-node-name">' + u.name + '</span>' +
          '<span class="chain-component">[' + shortComponentName(u.component) + ']</span>' +
          '<span class="chain-kind">' + uKindLabel + '</span>' +
          (durStr ? '<span class="chain-duration">' + durStr + '</span>' : '') +
          '</div>';
      }

      html += '<div class="chain-card">' +
        '<div class="chain-header">' +
          '<span class="chain-time">' + timeStr + '</span>' +
          '<span class="chain-trigger-icon kind-signal">&#9679;</span>' +
          '<span class="chain-trigger-name">' + chain.trigger.name + '</span>' +
          '<span class="chain-component">[' + shortComponentName(chain.trigger.component) + ']</span>' +
          (valChange ? '<span class="chain-value-change">' + valChange + '</span>' : '') +
          (summaryStr ? '<span class="chain-summary">' + summaryStr + '</span>' : '') +
        '</div>' +
        (chain.updates.length > 0 ? '<div class="chain-updates">' + updatesHtml + '</div>' : '') +
        '</div>';
    }
    timelineChainList.innerHTML = html;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // ── Component cards ───────────────────────────────────────────────────────
  function renderComponentCards() {
    if (componentMap.size === 0) {
      componentsPanel.innerHTML = '<div class="empty-state">No components tracked yet.</div>';
      return;
    }

    var components = Array.from(componentMap.values())
      .sort(function(a, b) { return b.totalUpdates - a.totalUpdates; });

    var html = '';
    for (var i = 0; i < components.length; i++) {
      var comp = components[i];
      var deadSignals = Array.from(nodeMap.values())
        .filter(function(n) { return n.component === comp.name && n.kind === 'signal' && n.epoch === 0; });

      var deadHtml = '';
      if (deadSignals.length > 0) {
        var uniqueDead = Array.from(new Set(deadSignals.map(function(s) { return s.name; })));
        deadHtml = '<div class="comp-dead">Unused signals (' + uniqueDead.length + ' unique): ' +
          uniqueDead.join(', ') + '</div>';
      }

      var slowestHtml = '';
      if (comp.slowestNode && comp.slowestMs > 1) {
        slowestHtml = '<div class="comp-info">Slowest: <strong>' + comp.slowestNode.name + '</strong> (' + comp.slowestMs.toFixed(1) + 'ms)</div>';
      }

      var mostActiveHtml = '';
      if (comp.mostActiveNode && comp.mostActiveCount > 0) {
        mostActiveHtml = '<div class="comp-info">Most active: <strong>' + comp.mostActiveNode.name + '</strong> (' + comp.mostActiveCount + ' updates)</div>';
      }

      html += '<div class="comp-card' + (comp.totalUpdates > 30 ? ' comp-hot' : '') + '">' +
        '<div class="comp-header">' +
          '<span class="comp-name">' + comp.name + '</span>' +
          '<span class="comp-total">' + comp.totalUpdates + ' updates</span>' +
        '</div>' +
        '<div class="comp-stats">' +
          '<span class="comp-stat kind-signal">&#9679; ' + comp.signals + ' signals</span>' +
          '<span class="comp-stat kind-memo">&#9670; ' + comp.memos + ' computed</span>' +
          '<span class="comp-stat kind-effect">&#9650; ' + comp.effects + ' effects</span>' +
        '</div>' +
        mostActiveHtml + slowestHtml + deadHtml +
        '</div>';
    }
    componentsPanel.innerHTML = html;

    runDiagnosticsCheck();
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────
  function runDiagnosticsCheck() {
    alerts = [];

    var hotChains = chainLog.filter(function(c) {
      return c.updates.reduce(function(s, u) { return s + (u.duration || 0); }, 0) > 16;
    });
    if (hotChains.length > 0) {
      alerts.push({
        severity: 'error',
        title: hotChains.length + ' slow update chain' + (hotChains.length > 1 ? 's' : '') + ' detected',
        desc: 'Some signal updates are taking over 16ms total, which causes dropped frames.',
        fix: 'Optimize the slowest computed properties or debounce high-frequency signal writes.'
      });
    }

    var deadSignals = Array.from(nodeMap.values())
      .filter(function(n) { return n.kind === 'signal' && n.epoch === 0; });
    if (deadSignals.length > 0) {
      var byComp = {};
      var totalUnique = 0;
      deadSignals.forEach(function(s) {
        var c = s.component || 'Global';
        if (!byComp[c]) byComp[c] = new Set();
        byComp[c].add(s.name);
      });
      var descParts = Object.keys(byComp).map(function(c) {
        totalUnique += byComp[c].size;
        return '<strong>' + c + '</strong>: ' + Array.from(byComp[c]).join(', ');
      });
      alerts.push({
        severity: 'warn',
        title: totalUnique + ' unused signal' + (totalUnique > 1 ? 's' : '') +
               ' across ' + Object.keys(byComp).length + ' component' + (Object.keys(byComp).length > 1 ? 's' : ''),
        desc: descParts.join('<br>'),
        fix: 'Remove unused signals or connect them to a computed or effect that reads their value.'
      });
    }

    alertBadge.style.display = alerts.length > 0 ? 'flex' : 'none';
    alertBadge.innerText = alerts.length;

    if (alerts.length === 0) {
      alertsSection.style.display = 'none';
      return;
    }
    alertsSection.style.display = 'flex';
    alertsPanel.innerHTML = alerts.map(function(a) {
      return '<div class="alert-card ' + a.severity + '">' +
        '<div class="alert-header">' +
          (a.severity === 'error' ? '&#128680;' : '&#9888;') +
          ' <span class="alert-title">' + a.title + '</span>' +
        '</div>' +
        '<div class="alert-desc">' + a.desc + '</div>' +
        '<div class="alert-fix"><strong>Fix:</strong> ' + a.fix + '</div>' +
        '</div>';
    }).join('');
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  btnRecord.addEventListener('click', function() {
    isRecording = !isRecording;
    btnRecord.classList.toggle('active', isRecording);
    btnRecord.innerHTML = isRecording ? '&#9679; Rec' : '&#9675; Paused';
  });

  btnClear.addEventListener('click', function() {
    nodeMap.clear();
    componentMap.clear();
    chainLog = [];
    alerts = [];
    activeChain = null;
    clearTimeout(chainFlushTimer);
    activityTableBody.innerHTML = '<tr class="empty-row"><td colspan="5">Cleared. Interact with your app to begin tracking.</td></tr>';
    timelineChainList.innerHTML = '<div class="empty-state">Cleared.</div>';
    if (componentsPanel) componentsPanel.innerHTML = '<div class="empty-state">No components tracked yet.</div>';
    alertBadge.style.display = 'none';
    alertsSection.style.display = 'none';
    vscode.postMessage({ command: 'clearMetrics' });
  });

  searchBar.addEventListener('input', function() { renderActivityTable(); });

  inactiveToggle.addEventListener('change', function() {
    showInactive = inactiveToggle.checked;
    renderActivityTable();
  });

  sortSelect.addEventListener('change', function() {
    sortBy = sortSelect.value;
    renderActivityTable();
  });

  // ── VS Code message handler ───────────────────────────────────────────────
  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg) return;

    if (msg.type === 'focus-node') {
      focusedSignalId = msg.id;
      activateTab('tab-activity');
      setTimeout(function() {
        var row = activityTableBody.querySelector('[data-id="' + msg.id + '"]');
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
      return;
    }

    processEvent(msg);
  });

  // Periodic refresh for timeSince + diagnostics
  setInterval(function() {
    var activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    if (activeTab.id === 'tab-activity') renderActivityTable();
    if (activeTab.id === 'tab-components') runDiagnosticsCheck();
  }, 4000);

  // Initial render
  renderActivityTable();

})();
