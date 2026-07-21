(function () {
  const vscode = acquireVsCodeApi();

  // ── State ────────────────────────────────────────────────────────────────
  const nodeMap = new Map();       // id -> node
  const nodeAliasMap = new Map();  // raw event id -> canonical node id
  const nodeSignatureMap = new Map(); // stable signature -> canonical node id
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
  let selectedSignalId = null;
  const pinnedSignalIds = new Set();
  const pinnedChainKeys = new Set();
  const hiddenChainIds = new Set();
  const expandedPinnedKeys = new Set();
  const valueScrollByNodeId = new Map();
  let timelineQuery = '';
  let timelinePinnedOnly = false;
  let timelineShowHidden = false;
  let pendingTableRender = false;

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const activityTableBody = document.getElementById('activity-table-body');
  const timelineChainList = document.getElementById('timeline-chain-list');
  const timelineSearch    = document.getElementById('timeline-search');
  const timelinePinnedOnlyToggle = document.getElementById('timeline-pinned-only');
  const timelineShowHiddenToggle = document.getElementById('timeline-show-hidden');
  const valuePanel        = document.getElementById('value-panel');
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
    if (tabId === 'tab-value') renderValueInspector();
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
        var signature = nodeSignature(msg);
        var canonicalId = nodeSignatureMap.get(signature) || msg.id;
        nodeAliasMap.set(msg.id, canonicalId);

        if (!nodeMap.has(canonicalId)) {
          var node = {
            id: canonicalId,
            name: cleanName(msg.name || msg.id),
            component: msg.component || 'Global',
            kind: msg.kind || 'signal',
            value: msg.value,
            epoch: 0,
            duration: 0,
            lastUpdated: null,
            sparkline: [],
            loc: msg.loc || null
          };
          nodeMap.set(canonicalId, node);
          nodeSignatureMap.set(signature, canonicalId);
          ensureComponent(node);
        } else {
          var existingNode = nodeMap.get(canonicalId);
          if (msg.value !== undefined) existingNode.value = msg.value;
          if (msg.loc) existingNode.loc = msg.loc;
          scheduleUiRender();
        }
        break;
      }
      case 'write': {
        var node = resolveNode(msg.id);
        if (node) {
          var prev = node.value;
          node.value = msg.value;
          node.epoch++;
          node.lastUpdated = Date.now();
          node.sparkline.push(Date.now());
          if (node.sparkline.length > 20) node.sparkline.shift();
          bumpComponent(node);
          startChain(node, prev);
          scheduleUiRender();
        }
        break;
      }
      case 'update': {
        var node = resolveNode(msg.id);
        if (node) {
          if (msg.value !== undefined) node.value = msg.value;
          node.epoch++;
          node.duration = msg.duration || 0;
          node.lastUpdated = Date.now();
          node.sparkline.push(Date.now());
          if (node.sparkline.length > 20) node.sparkline.shift();
          bumpComponent(node);
          extendChain(node);
          scheduleUiRender();
        }
        break;
      }
      case 'destroy': {
        var resolved = resolveNodeId(msg.id);
        nodeAliasMap.delete(msg.id);
        var stillReferenced = false;
        nodeAliasMap.forEach(function(value) {
          if (value === resolved) stillReferenced = true;
        });
        if (!stillReferenced) {
          nodeMap.delete(resolved);
          nodeSignatureMap.forEach(function(value, key) {
            if (value === resolved) nodeSignatureMap.delete(key);
          });
        }
        scheduleUiRender();
        break;
      }
    }
  }

  // debounce UI re-render so rapid bursts don't freeze
  var pendingUiRender = false;
  function scheduleUiRender() {
    if (pendingUiRender) return;
    pendingUiRender = true;
    requestAnimationFrame(function() {
      pendingUiRender = false;
      var activeTab = document.querySelector('.tab-content.active');
      if (!activeTab) return;
      if (activeTab.id === 'tab-activity') renderActivityTable();
      if (activeTab.id === 'tab-timeline') renderTimeline();
      if (activeTab.id === 'tab-value') renderValueInspector();
      if (activeTab.id === 'tab-components') renderComponentCards();
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

  function toLocKey(loc) {
    if (!loc || !loc.file) return 'unknown';
    return loc.file + ':' + (loc.line || 0) + ':' + (loc.column || 0);
  }

  function nodeSignature(payload) {
    return [
      payload.kind || 'signal',
      payload.component || 'Global',
      cleanName(payload.name || payload.id || 'unknown'),
      toLocKey(payload.loc)
    ].join('|');
  }

  function resolveNodeId(rawId) {
    return nodeAliasMap.get(rawId) || rawId;
  }

  function resolveNode(rawId) {
    return nodeMap.get(resolveNodeId(rawId));
  }

  function chainGroupKey(chain) {
    if (!chain || !chain.trigger) return 'unknown';
    return [
      chain.trigger.name || 'name',
      chain.trigger.component || 'Global',
      toLocKey(chain.trigger.loc)
    ].join('|');
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
    else if (node.kind === 'memo' || node.kind === 'computed') comp.memos++;
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
        previousValue: previousValue,
        loc: node.loc
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
      value: node.value,
      loc: node.loc
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

    rows.sort(function(a, b) {
      var pinDelta = Number(pinnedSignalIds.has(b.id)) - Number(pinnedSignalIds.has(a.id));
      return pinDelta;
    });

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
      var valueStr = safeStr(node.value, 60);
      var valueFull = fullStr(node.value);

      var timeStr = node.lastUpdated ? timeSince(node.lastUpdated) : 'never';
      var kindIcon = node.kind === 'signal' ? '&#9679;' : node.kind === 'memo' ? '&#9670;' : '&#9650;';
      var kindClass = 'kind-' + node.kind;
      var isHot = node.epoch > 30;
      var isFocused = node.id === focusedSignalId;
      var isPinned = pinnedSignalIds.has(node.id);
      var actBar = renderSparkBar(node.sparkline, node.epoch);
      var compShort = shortComponentName(node.component);

      var locHtml = '';
      if (node.loc) {
        var fileBase = node.loc.file.split('/').pop();
        locHtml = '<span class="signal-loc clickable" data-file="' + node.loc.file + '" data-line="' + node.loc.line + '" title="' + node.loc.file + '">' + fileBase + ':' + node.loc.line + '</span>';
      }

      html += '<tr class="signal-row' + (isHot ? ' row-hot' : '') + (isFocused ? ' row-focused' : '') + '" data-id="' + node.id + '">' +
        '<td class="col-name"><div class="col-name-wrap"><span class="kind-icon ' + kindClass + '">' + kindIcon + '</span><span class="signal-name" title="' + node.name + '">' + node.name + '</span><button class="pin-btn' + (isPinned ? ' active' : '') + '" data-action="toggle-pin" data-id="' + node.id + '" title="' + (isPinned ? 'Unpin signal' : 'Pin signal') + '">&#128204;</button></div>' + (locHtml ? '<div class="loc-wrap">' + locHtml + '</div>' : '') + '</td>' +
        '<td class="col-component" title="' + node.component + '">' + compShort + '</td>' +
        '<td class="col-value" title="' + escapeHtml(valueFull) + '">' + escapeHtml(valueStr) + '</td>' +
        '<td class="col-updates' + (isHot ? ' hot-count' : '') + '">' + node.epoch + '</td>' +
        '<td class="col-activity">' + actBar + '</td>' +
        '</tr>';

      if (isFocused) {
        var locDetail = node.loc
          ? '<span class="detail-label">Location:</span> <span class="detail-loc-link clickable" data-file="' + node.loc.file + '" data-line="' + node.loc.line + '">' + node.loc.file + ':' + node.loc.line + '</span>'
          : '<span class="detail-label">Location:</span> <span class="detail-val">Unknown</span>';

        html += '<tr class="details-row">' +
          '<td colspan="5">' +
            '<div class="details-box">' +
              '<div class="details-meta">' +
                '<div><span class="detail-label">Kind:</span> <span class="detail-val">' + node.kind + '</span></div>' +
                '<div>' + locDetail + '</div>' +
              '</div>' +
              '<div class="details-value-wrap">' +
                '<div class="details-actions"><span class="detail-label">Full Value:</span><button class="small-btn" data-action="copy-value" data-id="' + node.id + '">Copy value</button><button class="small-btn" data-action="open-value-tab" data-id="' + node.id + '">Open in Value tab</button></div>' +
                '<pre class="details-value"><code>' + escapeHtml(valueFull) + '</code></pre>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '</tr>';
      }
    }
    activityTableBody.innerHTML = html;
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

  function fullStr(val) {
    if (val === undefined) return 'undefined';
    if (typeof val === 'function') return 'function() {...}';
    try {
      return JSON.stringify(val, null, 2);
    } catch(e) {
      return String(val);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  function renderTimeline() {
    var grouped = new Map();
    for (var idx = 0; idx < chainLog.length; idx++) {
      var chain = chainLog[idx];
      var key = chainGroupKey(chain);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(chain);
    }

    var groupedEntries = Array.from(grouped.entries()).map(function(entry) {
      var key = entry[0];
      var chains = entry[1];
      var renderChains = chains.filter(function(chain) {
        return timelineShowHidden ? hiddenChainIds.has(chain.id) : !hiddenChainIds.has(chain.id);
      });
      return {
        key: key,
        chains: chains,
        renderChains: renderChains,
        latest: renderChains[0] || null,
        pinned: pinnedChainKeys.has(key),
        hasHidden: chains.some(function(c) { return hiddenChainIds.has(c.id); })
      };
    }).filter(function(group) {
      if (timelinePinnedOnly && !group.pinned) return false;
      if (!group.latest) return false;
      if (!timelineQuery) return true;
      var q = timelineQuery;
      var latest = group.latest;
      if (latest.trigger.name.toLowerCase().indexOf(q) !== -1) return true;
      if ((latest.trigger.component || '').toLowerCase().indexOf(q) !== -1) return true;
      return latest.updates.some(function(u) {
        return u.name.toLowerCase().indexOf(q) !== -1 ||
          (u.component || '').toLowerCase().indexOf(q) !== -1 ||
          (u.kind || '').toLowerCase().indexOf(q) !== -1;
      });
    });

    groupedEntries.sort(function(a, b) {
      var pinDelta = Number(b.pinned) - Number(a.pinned);
      if (pinDelta !== 0) return pinDelta;
      return (b.latest.timestamp || 0) - (a.latest.timestamp || 0);
    });

    if (groupedEntries.length === 0) {
      var emptyMsg = chainLog.length === 0
        ? 'No activity yet.<br>Interact with your app to see causal chains appear here.'
        : 'No timeline entries match the current filter.';
      timelineChainList.innerHTML = '<div class="empty-state">' + emptyMsg + '</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < groupedEntries.length; i++) {
      var group = groupedEntries[i];
      var chain = group.latest;
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

      var prevFull = fullStr(chain.trigger.previousValue);
      var newFull = fullStr(chain.trigger.value);
      var prevStr = safeStr(chain.trigger.previousValue, 30);
      var newStr  = safeStr(chain.trigger.value, 35);
      var valChange = prevStr ? prevStr + ' &rarr; ' + newStr : newStr;
      var valChangeTitle = prevFull ? prevFull + ' -> ' + newFull : newFull;

      var updatesHtml = '';
      for (var j = 0; j < chain.updates.length; j++) {
        var u = chain.updates[j];
        var uKindIcon = u.kind === 'memo' ? '&#9670;' : '&#9650;';
        var uKindLabel = u.kind === 'memo' ? 'computed' : 'effect';
        var durStr = u.duration > 0 ? '(' + u.duration.toFixed(1) + 'ms)' : '';
        var isUHot = u.duration > 2;
        var uValStr = u.value !== undefined ? safeStr(u.value, 30) : '';
        var uValFull = u.value !== undefined ? fullStr(u.value) : '';
        
        var uClickAttr = u.loc ? ' class="chain-node-name clickable" data-file="' + u.loc.file + '" data-line="' + u.loc.line + '"' : ' class="chain-node-name"';

        updatesHtml += '<div class="chain-update' + (isUHot ? ' chain-hot' : '') + '">' +
          '<span class="chain-indent">&#9492;&#9472;</span>' +
          '<span class="chain-icon kind-' + u.kind + '">' + uKindIcon + '</span>' +
          '<span' + uClickAttr + '>' + u.name + '</span>' +
          '<span class="chain-component">[' + shortComponentName(u.component) + ']</span>' +
          '<span class="chain-kind">' + uKindLabel + '</span>' +
          (uValStr ? '<span class="chain-value" title="' + escapeHtml(uValFull) + '">' + escapeHtml(uValStr) + '</span>' : '') +
          (durStr ? '<span class="chain-duration">' + durStr + '</span>' : '') +
          '</div>';
      }

      var trigClickAttr = chain.trigger.loc ? ' class="chain-trigger-name clickable" data-file="' + chain.trigger.loc.file + '" data-line="' + chain.trigger.loc.line + '"' : ' class="chain-trigger-name"';
      var chainPinned = group.pinned;
      var canExpand = group.renderChains.length > 1;
      var expanded = expandedPinnedKeys.has(group.key);
      var hiddenLabel = hiddenChainIds.has(chain.id) ? 'Show' : 'Hide';

      var olderHtml = '';
      if (chainPinned && canExpand && expanded) {
        for (var k = 1; k < group.renderChains.length; k++) {
          olderHtml += renderChainCard(group.renderChains[k], group.key);
        }
      }

      html += '<div class="chain-card' + (chainPinned ? ' chain-pinned' : '') + '">' +
        '<div class="chain-header">' +
          '<span class="chain-time">' + timeStr + '</span>' +
          '<span class="chain-trigger-icon kind-signal">&#9679;</span>' +
          '<span' + trigClickAttr + '>' + chain.trigger.name + '</span>' +
          '<span class="chain-component">[' + shortComponentName(chain.trigger.component) + ']</span>' +
          (valChange ? '<span class="chain-value-change" title="' + escapeHtml(valChangeTitle) + '">' + valChange + '</span>' : '') +
          (summaryStr ? '<span class="chain-summary">' + summaryStr + '</span>' : '') +
          '<button class="chain-pin-btn' + (chainPinned ? ' active' : '') + '" data-action="toggle-chain-pin" data-key="' + group.key + '">' + (chainPinned ? 'Pinned' : 'Pin') + '</button>' +
          '<button class="chain-hide-btn' + (hiddenChainIds.has(chain.id) ? ' active' : '') + '" data-action="toggle-chain-visibility" data-id="' + chain.id + '">' + hiddenLabel + '</button>' +
          (chainPinned && canExpand ? '<button class="chain-hide-btn" data-action="toggle-pinned-expand" data-key="' + group.key + '">' + (expanded ? 'Collapse older' : 'Expand older (' + (group.renderChains.length - 1) + ')') + '</button>' : '') +
          (!timelineShowHidden && group.hasHidden ? '<span class="chain-summary">hidden: ' + group.chains.filter(function(c) { return hiddenChainIds.has(c.id); }).length + '</span>' : '') +
        '</div>' +
        (chain.updates.length > 0 ? '<div class="chain-updates">' + updatesHtml + '</div>' : '') +
        '</div>' +
        olderHtml;
    }
    timelineChainList.innerHTML = html;
  }

  function renderChainCard(chain) {
    var d = new Date(chain.timestamp);
    var timeStr = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    var trigClickAttr = chain.trigger.loc ? ' class="chain-trigger-name clickable" data-file="' + chain.trigger.loc.file + '" data-line="' + chain.trigger.loc.line + '"' : ' class="chain-trigger-name"';
    var updatesHtml = '';
    for (var j = 0; j < chain.updates.length; j++) {
      var u = chain.updates[j];
      var uKindIcon = u.kind === 'memo' ? '&#9670;' : '&#9650;';
      var uKindLabel = u.kind === 'memo' ? 'computed' : 'effect';
      var durStr = u.duration > 0 ? '(' + u.duration.toFixed(1) + 'ms)' : '';
      var uClickAttr = u.loc ? ' class="chain-node-name clickable" data-file="' + u.loc.file + '" data-line="' + u.loc.line + '"' : ' class="chain-node-name"';
      updatesHtml += '<div class="chain-update">' +
        '<span class="chain-indent">&#9492;&#9472;</span>' +
        '<span class="chain-icon kind-' + u.kind + '">' + uKindIcon + '</span>' +
        '<span' + uClickAttr + '>' + u.name + '</span>' +
        '<span class="chain-component">[' + shortComponentName(u.component) + ']</span>' +
        '<span class="chain-kind">' + uKindLabel + '</span>' +
        (durStr ? '<span class="chain-duration">' + durStr + '</span>' : '') +
        '</div>';
    }
    var isHidden = hiddenChainIds.has(chain.id);
    return '<div class="chain-card">' +
      '<div class="chain-header">' +
      '<span class="chain-time">' + timeStr + '</span>' +
      '<span class="chain-trigger-icon kind-signal">&#9679;</span>' +
      '<span' + trigClickAttr + '>' + chain.trigger.name + '</span>' +
      '<span class="chain-component">[' + shortComponentName(chain.trigger.component) + ']</span>' +
      '<span class="chain-summary">older</span>' +
      '<button class="chain-hide-btn' + (isHidden ? ' active' : '') + '" data-action="toggle-chain-visibility" data-id="' + chain.id + '">' + (isHidden ? 'Show' : 'Hide') + '</button>' +
      '</div>' +
      (updatesHtml ? '<div class="chain-updates">' + updatesHtml + '</div>' : '') +
      '</div>';
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  // ── Component cards ───────────────────────────────────────────────────────
  function renderValueInspector() {
    var targetId = selectedSignalId || focusedSignalId;
    var node = targetId ? nodeMap.get(targetId) : null;
    if (!node) {
      if (valuePanel && valuePanel.dataset.nodeId) {
        valueScrollByNodeId.set(valuePanel.dataset.nodeId, valuePanel.scrollTop);
      }
      valuePanel.innerHTML = '<div class="empty-state">Select a signal from Activity to inspect the full value.</div>';
      valuePanel.dataset.nodeId = '';
      return;
    }

    if (valuePanel && valuePanel.dataset.nodeId) {
      valueScrollByNodeId.set(valuePanel.dataset.nodeId, valuePanel.scrollTop);
    }

    var value = fullStr(node.value);
    var locationText = node.loc ? (node.loc.file + ':' + node.loc.line) : 'Unknown';
    var updated = node.lastUpdated ? timeSince(node.lastUpdated) : 'never';
    valuePanel.innerHTML =
      '<div class="value-header">' +
        '<div class="value-title">' + escapeHtml(node.name) + '</div>' +
        '<button class="small-btn" data-action="copy-value" data-id="' + node.id + '">Copy value</button>' +
      '</div>' +
      '<div class="value-meta">' +
        '<span>Kind: <strong>' + escapeHtml(node.kind) + '</strong></span>' +
        '<span>Component: <strong>' + escapeHtml(node.component) + '</strong></span>' +
        '<span>Updates: <strong>' + node.epoch + '</strong></span>' +
        '<span>Last update: <strong>' + escapeHtml(updated) + '</strong></span>' +
      '</div>' +
      '<div class="value-meta"><span>Location: <strong>' + escapeHtml(locationText) + '</strong></span></div>' +
      '<pre class="value-code"><code>' + escapeHtml(value) + '</code></pre>';

    valuePanel.dataset.nodeId = node.id;
    var savedScroll = valueScrollByNodeId.get(node.id);
    if (typeof savedScroll === 'number') {
      valuePanel.scrollTop = savedScroll;
    }
  }

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
        deadHtml = '<div class="comp-dead">Suggestion: these signals have no observed writes yet (' + uniqueDead.length + '): ' +
          uniqueDead.join(', ') + '. This may be intentional.</div>';
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
        title: totalUnique + ' signal' + (totalUnique > 1 ? 's' : '') +
               ' with no observed writes across ' + Object.keys(byComp).length + ' component' + (Object.keys(byComp).length > 1 ? 's' : ''),
        desc: descParts.join('<br>'),
        fix: 'Review these as potential clean-up candidates. Keep them if they are placeholders or driven by future interactions.'
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
    nodeAliasMap.clear();
    nodeSignatureMap.clear();
    componentMap.clear();
    chainLog = [];
    pinnedSignalIds.clear();
    pinnedChainKeys.clear();
    hiddenChainIds.clear();
    expandedPinnedKeys.clear();
    selectedSignalId = null;
    timelineQuery = '';
    timelinePinnedOnly = false;
    timelineShowHidden = false;
    valueScrollByNodeId.clear();
    if (timelineSearch) timelineSearch.value = '';
    if (timelinePinnedOnlyToggle) timelinePinnedOnlyToggle.checked = false;
    if (timelineShowHiddenToggle) timelineShowHiddenToggle.checked = false;
    alerts = [];
    activeChain = null;
    clearTimeout(chainFlushTimer);
    activityTableBody.innerHTML = '<tr class="empty-row"><td colspan="5">Cleared. Interact with your app to begin tracking.</td></tr>';
    timelineChainList.innerHTML = '<div class="empty-state">Cleared.</div>';
    if (componentsPanel) componentsPanel.innerHTML = '<div class="empty-state">No components tracked yet.</div>';
    if (valuePanel) valuePanel.innerHTML = '<div class="empty-state">Select a signal from Activity to inspect the full value.</div>';
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

  if (timelineSearch) {
    timelineSearch.addEventListener('input', function() {
      timelineQuery = timelineSearch.value.trim().toLowerCase();
      renderTimeline();
    });
  }

  if (timelinePinnedOnlyToggle) {
    timelinePinnedOnlyToggle.addEventListener('change', function() {
      timelinePinnedOnly = timelinePinnedOnlyToggle.checked;
      renderTimeline();
    });
  }

  if (timelineShowHiddenToggle) {
    timelineShowHiddenToggle.addEventListener('change', function() {
      timelineShowHidden = timelineShowHiddenToggle.checked;
      renderTimeline();
    });
  }

  function copyToClipboard(text, button) {
    function markCopied() {
      if (!button) return;
      button.classList.add('success');
      var oldLabel = button.innerText;
      button.innerText = 'Copied';
      setTimeout(function() {
        button.classList.remove('success');
        button.innerText = oldLabel;
      }, 900);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(markCopied).catch(function() {
        fallbackCopy(text);
        markCopied();
      });
      return;
    }
    fallbackCopy(text);
    markCopied();
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // ── Code Navigation Delegation ───────────────────────────────────────────
  activityTableBody.addEventListener('click', function(e) {
    var pinBtn = e.target.closest('[data-action="toggle-pin"]');
    if (pinBtn) {
      var pinId = pinBtn.dataset.id;
      if (pinnedSignalIds.has(pinId)) pinnedSignalIds.delete(pinId);
      else pinnedSignalIds.add(pinId);
      renderActivityTable();
      e.stopPropagation();
      return;
    }

    var actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      var action = actionBtn.dataset.action;
      var actionId = actionBtn.dataset.id;
      var actionNode = actionId ? nodeMap.get(actionId) : null;
      if (action === 'copy-value' && actionNode) {
        copyToClipboard(fullStr(actionNode.value), actionBtn);
        e.stopPropagation();
        return;
      }
      if (action === 'open-value-tab' && actionNode) {
        selectedSignalId = actionNode.id;
        focusedSignalId = actionNode.id;
        activateTab('tab-value');
        e.stopPropagation();
        return;
      }
    }

    var target = e.target.closest('.clickable');
    if (target) {
      var file = target.dataset.file;
      var line = parseInt(target.dataset.line, 10);
      if (file && line) {
        vscode.postMessage({
          command: 'openFile',
          file: file,
          line: line,
          column: 0
        });
        e.stopPropagation();
        return;
      }
    }

    var row = e.target.closest('.signal-row');
    if (row) {
      var id = row.dataset.id;
      selectedSignalId = id;
      focusedSignalId = (focusedSignalId === id) ? null : id; // Toggle collapse/expand
      renderActivityTable();
    }
  });

  activityTableBody.addEventListener('dblclick', function(e) {
    var row = e.target.closest('.signal-row');
    if (row) {
      var id = row.dataset.id;
      var node = nodeMap.get(id);
      if (node && node.loc) {
        vscode.postMessage({
          command: 'openFile',
          file: node.loc.file,
          line: node.loc.line,
          column: 0
        });
      }
    }
  });

  timelineChainList.addEventListener('click', function(e) {
    var pinBtn = e.target.closest('[data-action="toggle-chain-pin"]');
    if (pinBtn) {
      var chainKey = pinBtn.dataset.key;
      if (!chainKey) return;
      if (pinnedChainKeys.has(chainKey)) {
        pinnedChainKeys.delete(chainKey);
        expandedPinnedKeys.delete(chainKey);
      } else {
        pinnedChainKeys.add(chainKey);
      }
      renderTimeline();
      return;
    }

    var hideBtn = e.target.closest('[data-action="toggle-chain-visibility"]');
    if (hideBtn) {
      var chainId = hideBtn.dataset.id;
      if (!chainId) return;
      if (hiddenChainIds.has(chainId)) hiddenChainIds.delete(chainId);
      else hiddenChainIds.add(chainId);
      renderTimeline();
      return;
    }

    var expandBtn = e.target.closest('[data-action="toggle-pinned-expand"]');
    if (expandBtn) {
      var groupKey = expandBtn.dataset.key;
      if (!groupKey) return;
      if (expandedPinnedKeys.has(groupKey)) expandedPinnedKeys.delete(groupKey);
      else expandedPinnedKeys.add(groupKey);
      renderTimeline();
      return;
    }

    var target = e.target.closest('.clickable');
    if (target) {
      var file = target.dataset.file;
      var line = parseInt(target.dataset.line, 10);
      if (file && line) {
        vscode.postMessage({
          command: 'openFile',
          file: file,
          line: line,
          column: 0
        });
      }
    }
  });

  // ── VS Code message handler ───────────────────────────────────────────────
  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg) return;

    if (msg.type === 'focus-node') {
      focusedSignalId = msg.id;
      selectedSignalId = msg.id;
      activateTab('tab-activity');
      setTimeout(function() {
        var row = activityTableBody.querySelector('[data-id="' + msg.id + '"]');
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
      return;
    }

    processEvent(msg);
  });

  if (valuePanel) {
    valuePanel.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action="copy-value"]');
      if (!btn) return;
      var id = btn.dataset.id;
      var node = id ? nodeMap.get(id) : null;
      if (!node) return;
      copyToClipboard(fullStr(node.value), btn);
    });
  }

  // Periodic refresh for timeSince + diagnostics
  setInterval(function() {
    var activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    if (activeTab.id === 'tab-activity') renderActivityTable();
    if (activeTab.id === 'tab-value') renderValueInspector();
    if (activeTab.id === 'tab-components') runDiagnosticsCheck();
  }, 4000);

  // Initial render
  renderActivityTable();

  // Request cached data from extension host
  vscode.postMessage({ command: 'ready' });

})();
