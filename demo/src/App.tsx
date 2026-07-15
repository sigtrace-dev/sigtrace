import { createSignal, createMemo, createEffect } from 'solid-js';

export default function App() {
  // 1. Simple count states
  const [count, setCount] = createSignal(0);
  const doubleCount = createMemo(() => count() * 2);

  // 2. Dynamic tracking states
  const [showDetails, setShowDetails] = createSignal(false);
  const [detailsValue, setDetailsValue] = createSignal('Secret Data');
  
  createEffect(() => {
    if (showDetails()) {
      console.log('Details opened. Value:', detailsValue());
    } else {
      console.log('Details are hidden.');
    }
  });

  // 3. Hotspot simulation states
  const [heavyInput, setHeavyInput] = createSignal(1);
  const [shouldLag, setShouldLag] = createSignal(false);

  const heavyMemo = createMemo(() => {
    const val = heavyInput();
    if (shouldLag()) {
      // Simulate expensive computation of ~5ms to trigger Hotspot warning
      const start = performance.now();
      while (performance.now() - start < 5) {
        // Block main thread briefly
      }
    }
    return val * 100;
  });

  return (
    <div style={{
      background: 'rgba(30, 41, 59, 0.7)',
      padding: '24px',
      'border-radius': '12px',
      border: '1px solid #475569',
      'backdrop-filter': 'blur(10px)',
      width: '380px',
      'box-shadow': '0 8px 32px rgba(0, 0, 0, 0.4)'
    }}>
      <h2 style={{
        margin: '0 0 16px 0',
        'font-size': '18px',
        color: '#60a5fa',
        'border-bottom': '1px solid #475569',
        'padding-bottom': '8px'
      }}>
        SigTrace Demo Panel
      </h2>

      {/* Feature 1: Simple Signals */}
      <section style={{ 'margin-bottom': '20px' }}>
        <h3 style={{ 'font-size': '13px', margin: '0 0 8px 0', color: '#94a3b8' }}>Simple Reactivity</h3>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <button 
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              'border-radius': '6px',
              cursor: 'pointer'
            }}
            onClick={() => setCount(count() + 1)}
          >
            Increment Count
          </button>
          <span>Count: {count()} | Double: {doubleCount()}</span>
        </div>
      </section>

      {/* Feature 2: Dynamic Tracking */}
      <section style={{ 'margin-bottom': '20px' }}>
        <h3 style={{ 'font-size': '13px', margin: '0 0 8px 0', color: '#94a3b8' }}>Dynamic Dependency Branching</h3>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <label style={{ display: 'flex', 'align-items': 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showDetails()} 
              onChange={(e) => setShowDetails(e.currentTarget.checked)}
            />
            Show Details (Subscribes to Details Value)
          </label>
          <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
            <input 
              type="text" 
              value={detailsValue()} 
              onInput={(e) => setDetailsValue(e.currentTarget.value)}
              style={{
                background: '#1e293b',
                border: '1px solid #475569',
                color: '#fff',
                padding: '4px 8px',
                'border-radius': '4px',
                width: '120px'
              }}
            />
            <span style={{ 'font-size': '11px', color: '#64748b' }}>Edit to trigger updates</span>
          </div>
        </div>
      </section>

      {/* Feature 3: Hotspot Profiling */}
      <section>
        <h3 style={{ 'font-size': '13px', margin: '0 0 8px 0', color: '#94a3b8' }}>Performance Hotspot Profiler</h3>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <label style={{ display: 'flex', 'align-items': 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={shouldLag()} 
              onChange={(e) => setShouldLag(e.currentTarget.checked)}
            />
            Enable Heavy Loop (Laggy Computation)
          </label>
          <button 
            style={{
              background: shouldLag() ? '#dc2626' : '#475569',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              'border-radius': '6px',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onClick={() => setHeavyInput(heavyInput() + 1)}
          >
            Trigger Computation
          </button>
          <span>Value: {heavyMemo()}</span>
        </div>
      </section>
    </div>
  );
}
