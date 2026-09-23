// web-bridge.js
//
// Lets the unmodified extension webview UI (app.js) run in a plain browser
// tab instead of inside VS Code or JetBrains. It plugs into the exact same
// spot the IDE hosts do: it defines window.acquireVsCodeApi() so app.js
// doesn't need to change at all, and it connects to the same local tracing
// WebSocket protocol as a "visualizer" client — the same role a second
// VS Code window already plays today when a tracing session is shared
// across windows.
(function () {
  var port = window.__SIGTRACE_WS_PORT__ || 8420;
  var socket = null;

  function connect() {
    socket = new WebSocket('ws://localhost:' + port);

    socket.addEventListener('open', function () {
      socket.send(JSON.stringify({ type: 'register-visualizer' }));
      window.postMessage({ type: 'tracing-state', active: true }, '*');
    });

    socket.addEventListener('message', function (event) {
      try {
        window.postMessage(JSON.parse(event.data), '*');
      } catch (e) {
        // Ignore a malformed frame rather than breaking the page.
      }
    });

    socket.addEventListener('close', function () {
      window.postMessage({ type: 'tracing-state', active: false }, '*');
      setTimeout(connect, 2000);
    });

    socket.addEventListener('error', function () {
      // The 'close' handler above will retry — nothing extra to do here.
    });
  }

  window.acquireVsCodeApi = function () {
    return {
      postMessage: function (message) {
        if (!message || !message.command) return;

        switch (message.command) {
          case 'ready':
            // register-visualizer above already replays cached signals and
            // the event buffer — no separate reply needed here.
            break;

          case 'openFile':
            fetch('/open-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                file: message.file,
                line: message.line,
                column: message.column || 0
              })
            }).catch(function () {
              // Best-effort only — there may be no editor to hand off to.
            });
            break;

          case 'startTracing':
            if (!socket || socket.readyState === WebSocket.CLOSED) connect();
            break;

          case 'stopTracing':
            // This tab stops listening — it does not tear down the shared
            // tracing server, since another window or tab may depend on it.
            if (socket) {
              socket.close();
              socket = null;
            }
            break;

          case 'clearMetrics':
            // Nothing server-side to clear in standalone web mode; the
            // panel already clears its own local view.
            break;
        }
      }
    };
  };

  connect();
})();
