const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8420');

ws.on('open', () => {
  console.log('Connected to SigTrace WS server');
  
  const registerMsg = {
    type: 'register',
    id: 'test-signal-1',
    name: 'testSignal',
    kind: 'signal',
    component: 'TestComponent',
    value: 0
  };
  
  ws.send(JSON.stringify(registerMsg));
  console.log('Sent register:', registerMsg);
  
  setTimeout(() => {
    const writeMsg = {
      type: 'write',
      id: 'test-signal-1',
      value: 1
    };
    ws.send(JSON.stringify(writeMsg));
    console.log('Sent write:', writeMsg);
    
    setTimeout(() => {
      ws.close();
      console.log('Done');
    }, 500);
  }, 500);
});

ws.on('error', (err) => {
  console.error('WS Error:', err);
});
