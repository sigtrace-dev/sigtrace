import { createSignal, createMemo, createEffect } from 'solid-js';

export default function App() {
  // 1. Simple count states
  const [count, setCount] = createSignal(0);
  const doubleCount = createMemo(() => count() * 2);

  // 2. Complex nested object state for JSON Tree Viewer verification
  const [userSession, setUserSession] = createSignal({
    user: {
      id: 418,
      name: 'Alex Rivera',
      email: 'alex.rivera@sigtrace.dev',
      roles: ['developer', 'tester'],
      preferences: {
        theme: 'dark',
        notifications: {
          email: true,
          push: false
        }
      }
    },
    status: 'authenticated',
    lastActive: new Date().toISOString()
  });

  // Mutators for nested state
  const toggleTheme = () => {
    setUserSession(prev => ({
      ...prev,
      user: {
        ...prev.user,
        preferences: {
          ...prev.user.preferences,
          theme: prev.user.preferences.theme === 'dark' ? 'light' : 'dark'
        }
      },
      lastActive: new Date().toISOString()
    }));
  };

  const addRole = () => {
    const roles = [...userSession().user.roles];
    if (!roles.includes('lead')) {
      roles.push('lead');
    } else {
      roles.filter(r => r !== 'lead');
    }
    setUserSession(prev => ({
      ...prev,
      user: {
        ...prev.user,
        roles
      },
      lastActive: new Date().toISOString()
    }));
  };

  const toggleEmail = () => {
    setUserSession(prev => ({
      ...prev,
      user: {
        ...prev.user,
        preferences: {
          ...prev.user.preferences,
          notifications: {
            ...prev.user.preferences.notifications,
            email: !prev.user.preferences.notifications.email
          }
        }
      },
      lastActive: new Date().toISOString()
    }));
  };

  // 3. Dynamic tracking states
  const [showDetails, setShowDetails] = createSignal(false);
  const [detailsValue, setDetailsValue] = createSignal('Top Secret Signal Data');
  
  createEffect(() => {
    if (showDetails()) {
      console.log('Details panel visible. Value:', detailsValue());
    }
  });

  // 4. Hotspot simulation states
  const [heavyInput, setHeavyInput] = createSignal(1);
  const [shouldLag, setShouldLag] = createSignal(false);

  const heavyMemo = createMemo(() => {
    const val = heavyInput();
    if (shouldLag()) {
      // Simulate expensive computation of ~25ms to trigger Hotspot warning
      const start = performance.now();
      while (performance.now() - start < 25) {
        // Block thread to trigger a perf issue
      }
    }
    return val * 100;
  });

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.85)',
      padding: '28px',
      'border-radius': '16px',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      'backdrop-filter': 'blur(16px)',
      width: '420px',
      'box-shadow': '0 20px 50px rgba(0, 0, 0, 0.5)',
      'font-family': 'system-ui, -apple-system, sans-serif'
    }}>
      <h2 style={{
        margin: '0 0 20px 0',
        'font-size': '20px',
        'font-weight': '700',
        background: 'linear-gradient(135deg, #60a5fa, #c084fc)',
        '-webkit-background-clip': 'text',
        '-webkit-text-fill-color': 'transparent',
        'border-bottom': '1px solid rgba(255, 255, 255, 0.08)',
        'padding-bottom': '12px',
        display: 'flex',
        'align-items': 'center',
        gap: '8px'
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: #60a5fa"><path d="m19 8-6 2-6-2M12 2v8M12 22v-6M19 16l-7-3-7 3"/></svg>
        SigTrace Demo Panel
      </h2>

      {/* Feature 1: Simple Reactivity */}
      <section style={{ 'margin-bottom': '24px' }}>
        <h3 style={{ 'font-size': '12px', 'text-transform': 'uppercase', 'letter-spacing': '0.5px', margin: '0 0 10px 0', color: '#64748b' }}>Simple Reactivity</h3>
        <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
          <button 
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              'border-radius': '6px',
              cursor: 'pointer',
              'font-size': '12px',
              'font-weight': '600',
              transition: 'all 0.2s'
            }}
            onClick={() => setCount(count() + 1)}
          >
            Increment Count
          </button>
          <span style={{ 'font-size': '12px', color: '#cbd5e1' }}>
            Count: <strong>{count()}</strong> | Double: <strong>{doubleCount()}</strong>
          </span>
        </div>
      </section>

      {/* Feature 2: Complex Nested Object Verification */}
      <section style={{ 'margin-bottom': '24px', padding: '12px', background: 'rgba(255,255,255,0.02)', 'border-radius': '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
        <h3 style={{ 'font-size': '12px', 'text-transform': 'uppercase', 'letter-spacing': '0.5px', margin: '0 0 10px 0', color: '#64748b' }}>Nested JSON Tree Verification</h3>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '6px' }}>
            <button 
              onClick={toggleTheme}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '4px 10px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '11px'
              }}
            >
              Toggle Preference Theme
            </button>
            <button 
              onClick={toggleEmail}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '4px 10px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '11px'
              }}
            >
              Toggle Preferences Email
            </button>
            <button 
              onClick={addRole}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: '#e2e8f0',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '4px 10px',
                'border-radius': '4px',
                cursor: 'pointer',
                'font-size': '11px'
              }}
            >
              Add/Remove 'lead' Role
            </button>
          </div>
          <div style={{ 'font-size': '10px', color: '#94a3b8', 'font-family': 'monospace', 'white-space': 'pre', background: 'rgba(0,0,0,0.2)', padding: '6px', 'border-radius': '4px', overflow: 'auto', 'max-height': '80px' }}>
            {JSON.stringify(userSession(), null, 2)}
          </div>
        </div>
      </section>

      {/* Feature 3: Dynamic Tracking */}
      <section style={{ 'margin-bottom': '24px' }}>
        <h3 style={{ 'font-size': '12px', 'text-transform': 'uppercase', 'letter-spacing': '0.5px', margin: '0 0 10px 0', color: '#64748b' }}>Dynamic Causal Branching</h3>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <label style={{ display: 'flex', 'align-items': 'center', gap: '8px', cursor: 'pointer', 'font-size': '12px', color: '#cbd5e1' }}>
            <input 
              type="checkbox" 
              checked={showDetails()} 
              onChange={(e) => setShowDetails(e.currentTarget.checked)}
              style={{ 'accent-color': '#3b82f6' }}
            />
            Show Details (Subscribes to Details Value)
          </label>
          <div style={{ display: 'flex', gap: '10px', 'align-items': 'center' }}>
            <input 
              type="text" 
              value={detailsValue()} 
              onInput={(e) => setDetailsValue(e.currentTarget.value)}
              style={{
                background: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                padding: '5px 10px',
                'border-radius': '6px',
                width: '180px',
                'font-size': '12px',
                outline: 'none'
              }}
            />
            <span style={{ 'font-size': '11px', color: '#64748b' }}>Edit text to trace</span>
          </div>
        </div>
      </section>

      {/* Feature 4: Hotspot Profiling */}
      <section>
        <h3 style={{ 'font-size': '12px', 'text-transform': 'uppercase', 'letter-spacing': '0.5px', margin: '0 0 10px 0', color: '#64748b' }}>Performance Hotspot</h3>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
          <label style={{ display: 'flex', 'align-items': 'center', gap: '8px', cursor: 'pointer', 'font-size': '12px', color: '#cbd5e1' }}>
            <input 
              type="checkbox" 
              checked={shouldLag()} 
              onChange={(e) => setShouldLag(e.currentTarget.checked)}
              style={{ 'accent-color': '#dc2626' }}
            />
            Enable Heavy Loop (Simulate 25ms Lag)
          </label>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '12px' }}>
            <button 
              style={{
                background: shouldLag() ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #4b5563, #374151)',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                'border-radius': '6px',
                cursor: 'pointer',
                'font-size': '12px',
                'font-weight': '600',
                transition: 'all 0.2s'
              }}
              onClick={() => setHeavyInput(heavyInput() + 1)}
            >
              Trigger Computation
            </button>
            <span style={{ 'font-size': '12px', color: '#cbd5e1' }}>
              Value: <strong>{heavyMemo()}</strong>
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
