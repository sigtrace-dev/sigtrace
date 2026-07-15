(function () {
  const vscode = acquireVsCodeApi();

  // State Variables
  let nodes = [];
  let links = [];
  const nodeMap = new Map();
  const linkMap = new Map(); // key: "fromId->toId"
  const componentGroups = new Set(); // set of component names
  let isRecording = true;
  let focusedNodeId = null;

  // History & Playback
  const historyEvents = [];
  let isPlaying = false;
  let playInterval = null;

  // Alerts / Diagnostics
  const alerts = [];
  const recentUpdates = []; // array of { id, time }

  // DOM Elements
  const container = document.getElementById('graph-container');
  const tooltip = document.getElementById('tooltip');
  const btnRecord = document.getElementById('btn-record');
  const btnClear = document.getElementById('btn-clear');
  const searchBar = document.getElementById('search-bar');
  const timelineSlider = document.getElementById('timeline-slider');
  const timelineCounter = document.getElementById('timeline-counter');
  const btnTimelinePlay = document.getElementById('btn-timeline-play');
  const timelineLogList = document.getElementById('timeline-log-list');
  const alertsList = document.getElementById('alerts-list');
  const alertBadge = document.getElementById('alert-badge');

  // SVG Setup
  const width = container.clientWidth || 300;
  const height = container.clientHeight || 500;

  const svg = d3.select('#graph-container')
    .append('svg')
    .attr('viewBox', [0, 0, width, height]);

  // Define Arrow Markers
  const defs = svg.append('defs');
  
  // Standard arrow marker
  defs.append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 18) // distance from node center
    .attr('refY', 0)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', 'var(--border-color)');

  // Untracked arrow marker (dashed/gray)
  defs.append('marker')
    .attr('id', 'arrow-untracked')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 18)
    .attr('refY', 0)
    .attr('markerWidth', 4)
    .attr('markerHeight', 4)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#64748b');

  // Main container for zoom/pan
  const g = svg.append('g');

  // Zoom Handler
  const zoom = d3.zoom()
    .scaleExtent([0.2, 5])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoom);

  // Shape generator and helpers
  const shapeGenerator = d3.symbol().size(150);
  function getSymbolType(kind) {
    if (kind === 'memo') return d3.symbolDiamond;
    if (kind === 'effect') return d3.symbolTriangle;
    return d3.symbolCircle;
  }

  // Custom clustering force to keep component group nodes together
  function componentClusterForce(alpha) {
    const centers = {};
    componentGroups.forEach(comp => {
      const compNodes = nodes.filter(n => n.component === comp);
      if (compNodes.length > 0) {
        let sumX = 0, sumY = 0;
        compNodes.forEach(n => { sumX += n.x; sumY += n.y; });
        centers[comp] = { x: sumX / compNodes.length, y: sumY / compNodes.length };
      }
    });

    nodes.forEach(n => {
      if (n.component && centers[n.component]) {
        const center = centers[n.component];
        n.vx += (center.x - n.x) * 0.08 * alpha;
        n.vy += (center.y - n.y) * 0.08 * alpha;
      }
    });
  }

  // Force Simulation Setup
  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(d => {
      return d.source.component === d.target.component ? 65 : 180;
    }))
    .force('charge', d3.forceManyBody().strength(-300).distanceMax(400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(35))
    .force('cluster', componentClusterForce)
    .on('tick', ticked);

  // Link & Node SVG Selections
  let groupSelection = g.append('g').selectAll('.group-card');
  let linkSelection = g.append('g').selectAll('.link');
  let nodeSelection = g.append('g').selectAll('.node');

  function ticked() {
    if (currentLayout === 'flow') {
      groupSelection = groupSelection.data([]);
      groupSelection.exit().remove();
    } else {
      // 1. Calculate and update Bounding Boxes
      const padding = 15;
      const groupsData = [];
      
      componentGroups.forEach(compName => {
        const compNodes = nodes.filter(n => n.component === compName);
        if (compNodes.length > 0) {
          let minX = Infinity, minY = Infinity;
          let maxX = -Infinity, maxY = -Infinity;
          compNodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.x > maxX) maxX = n.x;
            if (n.y > maxY) maxY = n.y;
          });

          groupsData.push({
            name: compName,
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + padding * 2,
            height: (maxY - minY) + padding * 2
          });
        }
      });

      groupSelection = groupSelection.data(groupsData, d => d.name);
      groupSelection.exit().remove();

      const groupEnter = groupSelection.enter()
        .insert('g', ':first-child')
        .attr('class', 'group-card');

      groupEnter.append('rect')
        .attr('rx', 6)
        .attr('ry', 6)
        .attr('fill', 'rgba(255, 255, 255, 0.02)')
        .attr('stroke', 'rgba(255, 255, 255, 0.08)')
        .attr('stroke-width', '1px');

      groupEnter.append('text')
        .attr('font-size', '8px')
        .attr('font-weight', '600')
        .attr('fill', 'rgba(255, 255, 255, 0.35)')
        .attr('font-family', 'monospace')
        .attr('dx', 8)
        .attr('dy', 12);

      groupSelection = groupEnter.merge(groupSelection);

      groupSelection.select('rect')
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .attr('width', d => d.width)
        .attr('height', d => d.height);

      groupSelection.select('text')
        .attr('x', d => d.x)
        .attr('y', d => d.y)
        .text(d => d.name.toUpperCase());
    }

    // 2. Update Link positions
    linkSelection
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    // 3. Update Node positions
    nodeSelection
      .attr('transform', d => `translate(${d.x},${d.y})`);
  }

  // Update Graph DOM Bindings
  function updateGraph() {
    // Re-bind Links
    linkSelection = linkSelection.data(links, d => `${d.source.id || d.source}->${d.target.id || d.target}`);
    linkSelection.exit().remove();

    const linkEnter = linkSelection.enter()
      .append('line')
      .attr('class', 'link')
      .attr('marker-end', d => d.untracked ? 'url(#arrow-untracked)' : 'url(#arrow)')
      .style('stroke', d => d.untracked ? '#64748b' : 'var(--border-color)');

    linkSelection = linkEnter.merge(linkSelection)
      .attr('marker-end', d => d.untracked ? 'url(#arrow-untracked)' : 'url(#arrow)')
      .style('stroke', d => d.untracked ? '#64748b' : 'var(--border-color)')
      .classed('untracked', d => d.untracked)
      .classed('active-flow', d => d.activeFlow);

    // Re-bind Nodes
    nodeSelection = nodeSelection.data(nodes, d => d.id);
    nodeSelection.exit().remove();

    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', d => `node node-${d.kind}`)
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        toggleNodeFocus(d.id);
      })
      .on('dblclick', (event, d) => {
        if (d.loc) {
          vscode.postMessage({
            command: 'openFile',
            file: d.loc.file,
            line: d.loc.line,
            column: d.loc.column
          });
        }
      })
      .on('mouseover', showTooltip)
      .on('mousemove', moveTooltip)
      .on('mouseout', hideTooltip);

    nodeEnter.append('path')
      .attr('d', d => shapeGenerator.type(getSymbolType(d.kind))())
      .attr('fill', d => {
        if (d.kind === 'signal') return 'var(--accent-color)';
        if (d.kind === 'memo') return '#06b6d4';
        return '#ec4899';
      })
      .attr('stroke', 'rgba(255,255,255,0.2)')
      .attr('stroke-width', '1px');

    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('dx', 10)
      .attr('dy', 4)
      .text(d => d.name);

    nodeSelection = nodeEnter.merge(nodeSelection)
      .attr('class', d => {
        let classes = `node node-${d.kind}`;
        if (d.isHotspot) classes += ' node-hotspot';
        else if (d.epoch > 20) classes += ' node-warn';
        return classes;
      });

    nodeSelection.select('text')
      .text(d => `${d.name} (${d.epoch})`);

    // Apply Focus Filtering and Search queries
    applyFilters();

    if (currentLayout === 'flow') {
      const signals = nodes.filter(n => n.kind === 'signal')
        .sort((a, b) => (a.component || '').localeCompare(b.component || ''));
      const memos = nodes.filter(n => n.kind === 'memo')
        .sort((a, b) => (a.component || '').localeCompare(b.component || ''));
      const effects = nodes.filter(n => n.kind === 'effect')
        .sort((a, b) => (a.component || '').localeCompare(b.component || ''));

      const marginY = 50;
      const startY = 60;

      signals.forEach((n, idx) => {
        n.x = width * 0.18; n.y = startY + idx * marginY;
        n.fx = n.x; n.fy = n.y;
      });
      memos.forEach((n, idx) => {
        n.x = width * 0.5; n.y = startY + idx * marginY;
        n.fx = n.x; n.fy = n.y;
      });
      effects.forEach((n, idx) => {
        n.x = width * 0.82; n.y = startY + idx * marginY;
        n.fx = n.x; n.fy = n.y;
      });

      // Remove group cards
      groupSelection = groupSelection.data([]);
      groupSelection.exit().remove();

      nodeSelection.attr('transform', d => `translate(${d.x},${d.y})`);
      linkSelection
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      simulation.stop();
    } else {
      // Restart simulation
      simulation.nodes(nodes);
      simulation.force('link').links(links);
      simulation.alpha(0.3).restart();
    }
  }

  // Focus & Search Filtering Logic
  function applyFilters() {
    const searchQuery = searchBar.value.trim().toLowerCase();
    
    // Determine which nodes match the search or focus path
    let activeNodeIds = null;
    let neighborNodeIds = null;

    if (focusedNodeId) {
      activeNodeIds = new Set([focusedNodeId]);
      neighborNodeIds = new Set();
      
      // Add direct upstream and downstream nodes
      links.forEach(l => {
        const sourceId = l.source.id || l.source;
        const targetId = l.target.id || l.target;
        if (sourceId === focusedNodeId) neighborNodeIds.add(targetId);
        if (targetId === focusedNodeId) neighborNodeIds.add(sourceId);
      });
    }

    nodeSelection.each(function (d) {
      const gNode = d3.select(this);
      let isMatch = true;

      // 1. Check Search query
      if (searchQuery) {
        const nameMatch = d.name.toLowerCase().includes(searchQuery);
        const compMatch = d.component && d.component.toLowerCase().includes(searchQuery);
        if (!nameMatch && !compMatch) {
          isMatch = false;
        }
      }

      // 2. Check Focus Path
      let opacity = 1.0;
      if (activeNodeIds) {
        if (activeNodeIds.has(d.id)) {
          opacity = 1.0;
        } else if (neighborNodeIds.has(d.id)) {
          opacity = 0.8;
        } else {
          opacity = 0.12;
        }
      } else if (!isMatch) {
        opacity = 0.12;
      }

      gNode.select('circle').style('opacity', opacity);
      gNode.select('text').style('opacity', opacity);
    });

    linkSelection.each(function (l) {
      const linkLine = d3.select(this);
      const sId = l.source.id || l.source;
      const tId = l.target.id || l.target;

      let opacity = 0.6;
      if (activeNodeIds) {
        const sActive = activeNodeIds.has(sId) || neighborNodeIds.has(sId);
        const tActive = activeNodeIds.has(tId) || neighborNodeIds.has(tId);
        if (sActive && tActive) {
          opacity = 0.7;
        } else {
          opacity = 0.05;
        }
      } else if (searchQuery) {
        // If query is active, dim links where either endpoint doesn't match query
        const sNode = nodeMap.get(sId);
        const tNode = nodeMap.get(tId);
        const sMatch = sNode && (sNode.name.toLowerCase().includes(searchQuery) || (sNode.component && sNode.component.toLowerCase().includes(searchQuery)));
        const tMatch = tNode && (tNode.name.toLowerCase().includes(searchQuery) || (tNode.component && tNode.component.toLowerCase().includes(searchQuery)));
        if (!sMatch || !tMatch) {
          opacity = 0.05;
        }
      }

      linkLine.style('opacity', opacity);
    });
  }

  function centerNode(id) {
    if (!id) return;
    const node = nodeMap.get(id);
    if (!node) return;

    const scale = 1.3;
    const x = width / 2 - node.x * scale;
    const y = height / 2 - node.y * scale;

    svg.transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity.translate(x, y).scale(scale)
      );
  }

  function toggleNodeFocus(id) {
    if (focusedNodeId === id) {
      focusedNodeId = null;
    } else {
      focusedNodeId = id;
      centerNode(id);
    }
    applyFilters();
  }

  // Click background to clear focus
  svg.on('click', () => {
    focusedNodeId = null;
    applyFilters();
  });

  // Node Drag Event Handlers
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // Tooltip Handlers
  function showTooltip(event, d) {
    tooltip.style.display = 'flex';
    
    let valueStr = typeof d.value === 'object' ? JSON.stringify(d.value) : String(d.value);
    if (valueStr.length > 30) valueStr = valueStr.substring(0, 27) + '...';

    let locationStr = 'Runtime Registered';
    if (d.loc) {
      const parts = d.loc.file.split('/');
      const filename = parts[parts.length - 1];
      locationStr = `${filename}:${d.loc.line}:${d.loc.column}`;
    }

    tooltip.innerHTML = `
      <div class="tooltip-title">${d.name}</div>
      <div class="tooltip-row"><span>Component:</span><span style="color:#f43f5e">${d.component || 'Global'}</span></div>
      <div class="tooltip-row"><span>Kind:</span><span style="color:#a78bfa">${d.kind}</span></div>
      <div class="tooltip-row"><span>Value:</span><span class="tooltip-val">${valueStr}</span></div>
      <div class="tooltip-row"><span>Updates:</span><span>${d.epoch}</span></div>
      <div class="tooltip-row"><span>Exec Time:</span><span>${d.duration ? d.duration.toFixed(2) + 'ms' : '0.00ms'}</span></div>
      <div class="tooltip-row"><span>Location:</span><span style="color:#94a3b8">${locationStr}</span></div>
    `;
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    let left = event.clientX + 10;
    let top = event.clientY + 10;

    if (left + tooltipWidth > container.clientWidth) {
      left = event.clientX - tooltipWidth - 10;
    }
    if (top + tooltipHeight > container.clientHeight) {
      top = event.clientY - tooltipHeight - 10;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  // Flash node on update
  function flashNode(id) {
    const nodeEl = nodeSelection.filter(d => d.id === id);
    const node = nodeMap.get(id);
    if (!node) return;

    let flashClass = 'flash-sig';
    if (node.kind === 'memo') flashClass = 'flash-comp';
    else if (node.kind === 'effect') flashClass = 'flash-eff';

    nodeEl.classed(flashClass, true);
    setTimeout(() => {
      nodeEl.classed(flashClass, false);
    }, 800);
  }

  function applyEvent(msg, updateDOM = true) {
    switch (msg.type) {
      case 'destroy': {
        const index = nodes.findIndex(n => n.id === msg.id);
        if (index !== -1) {
          nodes.splice(index, 1);
          nodeMap.delete(msg.id);
          // Clean up associated links
          links = links.filter(l => {
            const sId = l.source.id || l.source;
            const tId = l.target.id || l.target;
            const match = sId === msg.id || tId === msg.id;
            if (match) {
              const key = `${sId}->${tId}`;
              linkMap.delete(key);
            }
            return !match;
          });
          // Clean up empty component container
          const compName = msg.component;
          if (compName && !nodes.some(n => n.component === compName)) {
            componentGroups.delete(compName);
          }
          if (updateDOM) updateGraph();
        }
        break;
      }

      case 'register': {
        if (!nodeMap.has(msg.id)) {
          const newNode = {
            id: msg.id,
            name: msg.name,
            kind: msg.kind,
            value: msg.value,
            loc: msg.loc,
            component: msg.component || 'Global',
            epoch: 0,
            duration: 0,
            isHotspot: false,
            x: width / 2 + (Math.random() - 0.5) * 50,
            y: height / 2 + (Math.random() - 0.5) * 50
          };
          nodes.push(newNode);
          nodeMap.set(msg.id, newNode);
          if (newNode.component) {
            componentGroups.add(newNode.component);
          }
          if (updateDOM) updateGraph();
        }
        break;
      }

      case 'read': {
        const node = nodeMap.get(msg.id);
        if (node) {
          node.value = msg.value;
          if (updateDOM) flashNode(msg.id);
        }
        break;
      }

      case 'write': {
        const node = nodeMap.get(msg.id);
        if (node) {
          node.value = msg.value;
          node.epoch++;
          if (updateDOM) {
            flashNode(msg.id);
            triggerPathFlow(msg.id);
            updateGraph();
          }
        }
        break;
      }

      case 'link': {
        const key = `${msg.fromId}->${msg.toId}`;
        let linkObj = linkMap.get(key);

        if (!linkObj) {
          if (nodeMap.has(msg.fromId) && nodeMap.has(msg.toId)) {
            linkObj = {
              source: msg.fromId,
              target: msg.toId,
              untracked: false,
              activeFlow: false
            };
            links.push(linkObj);
            linkMap.set(key, linkObj);
            if (updateDOM) updateGraph();
          }
        } else if (linkObj.untracked) {
          linkObj.untracked = false;
          if (updateDOM) updateGraph();
        }
        break;
      }

      case 'unlink': {
        const key = `${msg.fromId}->${msg.toId}`;
        const linkObj = linkMap.get(key);
        if (linkObj) {
          linkObj.untracked = true;
          if (updateDOM) updateGraph();
        }
        break;
      }

      case 'update': {
        const node = nodeMap.get(msg.id);
        if (node) {
          if (msg.value !== undefined) {
            node.value = msg.value;
          }
          node.epoch++;
          node.duration = msg.duration;
          node.isHotspot = msg.duration > 2.0;

          if (updateDOM) {
            flashNode(msg.id);
            updateGraph();
          }
        }
        break;
      }
    }
  }

  function playbackTo(index) {
    // Reset state
    nodes = [];
    links = [];
    nodeMap.clear();
    linkMap.clear();
    componentGroups.clear();

    // Replay history
    for (let i = 0; i <= index; i++) {
      applyEvent(historyEvents[i], false);
    }
    updateGraph();
    timelineCounter.innerText = (index + 1) + '/' + historyEvents.length;
  }

  // Flow animation helper
  function triggerPathFlow(startNodeId) {
    links.forEach(l => {
      const sourceId = l.source.id || l.source;
      if (sourceId === startNodeId && !l.untracked) {
        l.activeFlow = true;
        setTimeout(() => {
          l.activeFlow = false;
          updateGraph();
        }, 1000);
        
        const targetId = l.target.id || l.target;
        triggerPathFlow(targetId);
      }
    });
  }

  // Add event to chronological log list DOM
  function logEventToDOM(msg) {
    const item = document.createElement('div');
    item.className = `log-item ${msg.kind || 'signal'}`;

    const date = new Date();
    const timeStr = date.toTimeString().split(' ')[0] + '.' + String(date.getMilliseconds()).padStart(3, '0');

    let label = msg.name || msg.id;
    let actionDesc = '';

    if (msg.type === 'register') {
      const initialValDesc = msg.value !== undefined ? ` with initial value: ${JSON.stringify(msg.value)}` : '';
      actionDesc = `Registered [${msg.component || 'Global'}]${initialValDesc}`;
    }
    else if (msg.type === 'read') actionDesc = `Read value: ${JSON.stringify(msg.value)}`;
    else if (msg.type === 'write') actionDesc = `Write value: ${JSON.stringify(msg.value)}`;
    else if (msg.type === 'update') actionDesc = `Re-evaluated in ${msg.duration?.toFixed(2)}ms`;

    item.innerHTML = `
      <span class="log-time">${timeStr}</span>
      <span class="log-msg"><strong>${label}</strong> ${actionDesc}</span>
    `;

    timelineLogList.appendChild(item);
    // keep only last 100 elements to avoid DOM overload
    while (timelineLogList.children.length > 100) {
      timelineLogList.removeChild(timelineLogList.firstChild);
    }
  }

  // Diagnostics & Anomaly Checks
  // Diagnostics & Anomaly Checks
  function rebuildAlertsDOM() {
    alertsList.innerHTML = '';
    alerts.forEach(alert => {
      let solution = '';
      if (alert.type === 'dead-code') {
        solution = '<strong>Fix:</strong> Unused signals waste memory and CPU cycles. If these are obsolete, delete their declarations. Otherwise, ensure they are referenced in a template, computed memo, or effect.';
      } else if (alert.type === 'circular') {
        solution = '<strong>Fix:</strong> Circular invalidations occur when an effect writes to a signal that it also reads (causing it to re-trigger itself infinitely). Decouple the read/write logic, or wrap the reading code inside <code>untracked()</code> (Angular) or <code>untrack()</code> (Solid/Vue) to prevent re-evaluation loops.';
      } else if (alert.type === 'hotspot') {
        solution = '<strong>Fix:</strong> This computation is blocking the main thread. Optimize the formula logic, cache intermediate heavy calculations, or split it into smaller, lighter computed selectors.';
      }

      const item = document.createElement('div');
      item.className = `alert-item ${alert.severity}`;
      item.innerHTML = `
        <div class="alert-title">
          ${alert.severity === 'warn' ? '⚠️' : '🚨'} ${alert.title}
        </div>
        <div class="alert-desc">${alert.desc}</div>
        ${solution ? `<div class="alert-solution">${solution}</div>` : ''}
      `;
      alertsList.appendChild(item);
    });

    alertBadge.style.display = alerts.length > 0 ? 'block' : 'none';
    alertBadge.innerText = alerts.length;
  }

  function addAlert(type, title, desc, severity = 'warn') {
    const exists = alerts.find(a => a.title === title && a.desc === desc);
    if (exists) return;

    const alert = { type, title, desc, severity, id: Math.random().toString(36).substring(2, 9) };
    alerts.push(alert);
    rebuildAlertsDOM();
  }

  function runDiagnosticsCheck() {
    const deadSignals = [];
    nodes.forEach(n => {
      if (n.kind === 'signal') {
        const hasOutgoingLinks = links.some(l => {
          const sId = l.source.id || l.source;
          return sId === n.id && !l.untracked;
        });

        if (!hasOutgoingLinks && n.epoch === 0) {
          deadSignals.push(n);
        }
      }
    });

    const oldAlertCount = alerts.length;
    alerts = alerts.filter(a => a.type !== 'dead-code');

    if (deadSignals.length > 0) {
      const componentsMap = {};
      deadSignals.forEach(s => {
        const compName = s.component || 'Global';
        if (!componentsMap[compName]) componentsMap[compName] = [];
        componentsMap[compName].push(`"${s.name}"`);
      });

      const groupedDescList = Object.keys(componentsMap).map(comp => {
        return `<strong>${comp}</strong>: ${componentsMap[comp].join(', ')}`;
      });

      addAlert(
        'dead-code',
        `Dead Signals Detected (${deadSignals.length})`,
        `The following signals are declared but never observed:<br/>${groupedDescList.join('<br/>')}`,
        'warn'
      );
    } else {
      if (alerts.length !== oldAlertCount) {
        rebuildAlertsDOM();
      }
    }
  }
  }

  // Run diagnostics check every 4 seconds
  setInterval(runDiagnosticsCheck, 4000);

  // Handle Incoming VS Code Messages
  window.addEventListener('message', (event) => {
    const msg = event.data;

    // Direct command to focus node from CodeLens click
    if (msg.type === 'focus-node') {
      focusedNodeId = msg.id;
      applyFilters();
      centerNode(msg.id);
      // Auto-switch to visualizer tab
      document.querySelector('[data-tab="tab-graph"]').click();
      return;
    }

    if (!isRecording) return;

    // Stream to play timeline log
    if (['register', 'read', 'write', 'link', 'unlink', 'update'].includes(msg.type)) {
      historyEvents.push(msg);

      const sliderAtEnd = timelineSlider.value == timelineSlider.max;
      timelineSlider.max = historyEvents.length - 1;

      if (sliderAtEnd) {
        timelineSlider.value = historyEvents.length - 1;
        applyEvent(msg, true);
        timelineCounter.innerText = historyEvents.length + '/' + historyEvents.length;
      } else {
        timelineCounter.innerText = (parseInt(timelineSlider.value) + 1) + '/' + historyEvents.length;
      }

      // Add to linear timeline log tab
      if (['register', 'read', 'write', 'update'].includes(msg.type)) {
        // Find node name
        const node = nodeMap.get(msg.id);
        logEventToDOM({
          ...msg,
          name: node ? node.name : msg.id,
          kind: node ? node.kind : 'signal'
        });
      }

      // High frequency circular invalidation check
      if (['write', 'update'].includes(msg.type)) {
        const now = Date.now();
        recentUpdates.push({ id: msg.id, time: now });
        
        // Remove updates older than 1 second
        while (recentUpdates.length > 0 && recentUpdates[0].time < now - 1000) {
          recentUpdates.shift();
        }

        const count = recentUpdates.filter(u => u.id === msg.id).length;
        if (count > 25) {
          const node = nodeMap.get(msg.id);
          addAlert('circular', 'Reactivity Loop Alert', `Signal "${node ? node.name : msg.id}" in ${node ? node.component : 'Global'} has re-evaluated ${count} times in the last second. Potential infinite render loop!`, 'error');
        }
      }

      // Hotspot timing alert
      if (msg.type === 'update' && msg.duration > 2.0) {
        const node = nodeMap.get(msg.id);
        addAlert('hotspot', 'Computation Hotspot', `Computed Memo "${node ? node.name : msg.id}" took ${msg.duration.toFixed(2)}ms to re-evaluate, exceeding frame efficiency budget.`, 'warn');
      }
    }
  });

  // UI Tabs Event Binding
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Timeline Slider Event
  timelineSlider.addEventListener('input', () => {
    playbackTo(parseInt(timelineSlider.value));
  });

  // Playback Auto Player
  btnTimelinePlay.addEventListener('click', () => {
    if (isPlaying) {
      isPlaying = false;
      btnTimelinePlay.innerText = 'Play';
      clearInterval(playInterval);
    } else {
      if (historyEvents.length === 0) return;
      isPlaying = true;
      btnTimelinePlay.innerText = 'Pause';
      
      // If slider is at the end, reset to 0
      if (timelineSlider.value == timelineSlider.max) {
        timelineSlider.value = 0;
        playbackTo(0);
      }

      playInterval = setInterval(() => {
        let val = parseInt(timelineSlider.value);
        if (val < historyEvents.length - 1) {
          val++;
          timelineSlider.value = val;
          playbackTo(val);
        } else {
          // finished
          isPlaying = false;
          btnTimelinePlay.innerText = 'Play';
          clearInterval(playInterval);
        }
      }, 300);
    }
  });

  // Search Filter event
  searchBar.addEventListener('input', applyFilters);

  // Control Actions
  btnRecord.addEventListener('click', () => {
    isRecording = !isRecording;
    btnRecord.classList.toggle('active', isRecording);
  });

  btnClear.addEventListener('click', () => {
    nodes = [];
    links = [];
    nodeMap.clear();
    linkMap.clear();
    componentGroups.clear();
    historyEvents.length = 0;
    alerts.length = 0;
    recentUpdates.length = 0;
    
    // Clear DOM lists
    timelineLogList.innerHTML = '';
    alertsList.innerHTML = '';
    alertBadge.style.display = 'none';
    alertBadge.innerText = '0';
    
    // Reset Timeline controls
    timelineSlider.max = 0;
    timelineSlider.value = 0;
    timelineCounter.innerText = '0/0';

    updateGraph();
    
    // Post clear message to VS Code to wipe CodeLenses
    vscode.postMessage({ command: 'clearMetrics' });
  });

  // Handle Window Resizing
  window.addEventListener('resize', () => {
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    svg.attr('viewBox', [0, 0, newWidth, newHeight]);
    simulation.force('center', d3.forceCenter(newWidth / 2, newHeight / 2));
    simulation.alpha(0.1).restart();
  });

  // Camera Controls
  d3.select('#btn-zoom-in').on('click', () => {
    svg.transition().duration(300).call(zoom.scaleBy, 1.3);
  });

  d3.select('#btn-zoom-out').on('click', () => {
    svg.transition().duration(300).call(zoom.scaleBy, 0.7);
  });

  d3.select('#btn-zoom-reset').on('click', () => {
    resetCamera();
  });

  function resetCamera() {
    if (nodes.length === 0) {
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
      return;
    }

    const minX = d3.min(nodes, d => d.x) || 0;
    const maxX = d3.max(nodes, d => d.x) || 100;
    const minY = d3.min(nodes, d => d.y) || 0;
    const maxY = d3.max(nodes, d => d.y) || 100;

    const pad = 40;
    const graphWidth = (maxX - minX) || 100;
    const graphHeight = (maxY - minY) || 100;
    const scale = Math.min(1.2, Math.min((width - pad * 2) / graphWidth, (height - pad * 2) / graphHeight));

    const tx = width / 2 - (minX + graphWidth / 2) * scale;
    const ty = height / 2 - (minY + graphHeight / 2) * scale;

    svg.transition().duration(750).call(
      zoom.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  // Layout Management
  let currentLayout = 'network';

  function updateLayoutUI(layout) {
    document.getElementById('btn-layout-network').classList.toggle('active', layout === 'network');
    document.getElementById('btn-layout-flow').classList.toggle('active', layout === 'flow');
  }

  function applyFlowLayout() {
    simulation.stop();

    const signals = nodes.filter(n => n.kind === 'signal')
      .sort((a, b) => (a.component || '').localeCompare(b.component || ''));
    const memos = nodes.filter(n => n.kind === 'memo')
      .sort((a, b) => (a.component || '').localeCompare(b.component || ''));
    const effects = nodes.filter(n => n.kind === 'effect')
      .sort((a, b) => (a.component || '').localeCompare(b.component || ''));

    const marginY = 50;
    const startY = 60;

    signals.forEach((n, idx) => {
      n.targetX = width * 0.18;
      n.targetY = startY + idx * marginY;
    });
    memos.forEach((n, idx) => {
      n.targetX = width * 0.5;
      n.targetY = startY + idx * marginY;
    });
    effects.forEach((n, idx) => {
      n.targetX = width * 0.82;
      n.targetY = startY + idx * marginY;
    });

    // Remove group cards
    groupSelection = groupSelection.data([]);
    groupSelection.exit().remove();

    nodeSelection.transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .attrTween('transform', function(d) {
        const fromX = d.x;
        const fromY = d.y;
        d.x = d.targetX;
        d.y = d.targetY;
        d.fx = d.targetX;
        d.fy = d.targetY;
        return function(t) {
          const curX = fromX + (d.targetX - fromX) * t;
          const curY = fromY + (d.targetY - fromY) * t;
          return `translate(${curX},${curY})`;
        };
      })
      .end()
      .then(() => {
        resetCamera();
      });

    linkSelection.transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
  }

  function applyNetworkLayout() {
    nodes.forEach(d => {
      d.fx = null;
      d.fy = null;
    });
    simulation.alpha(0.3).restart();
    setTimeout(resetCamera, 600);
  }

  function setLayout(layout) {
    if (currentLayout === layout) return;
    currentLayout = layout;
    updateLayoutUI(layout);

    const state = vscode.getState() || {};
    state.layout = layout;
    vscode.setState(state);

    if (layout === 'flow') {
      applyFlowLayout();
    } else {
      applyNetworkLayout();
    }
  }

  d3.select('#btn-layout-network').on('click', () => setLayout('network'));
  d3.select('#btn-layout-flow').on('click', () => setLayout('flow'));

  // Load and restore layout state
  const savedState = vscode.getState();
  if (savedState && savedState.layout) {
    currentLayout = savedState.layout;
    updateLayoutUI(currentLayout);
    setTimeout(() => {
      if (currentLayout === 'flow') {
        applyFlowLayout();
      }
    }, 500);
  }
})();
