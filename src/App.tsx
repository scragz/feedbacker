import { useState, useEffect, useCallback } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';
import { initializeAudioSystem, ensureAudioContextResumed, getAudioContext } from './audio';

function App() {
  const [count, setCount] = useState(0);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | null>(null);

  useEffect(() => {
    const initAudio = async () => {
      try {
        await initializeAudioSystem();
        setAudioInitialized(true);
        const context = getAudioContext();
        setAudioContextState(context.state);
        console.log('[App.tsx] Audio system initialized successfully.');

        context.onstatechange = () => {
          setAudioContextState(context.state);
          console.log(`[App.tsx] AudioContext state changed to: ${context.state}`);
        };
      } catch (error) {
        console.error('[App.tsx] Failed to initialize audio system:', error);
        setAudioError((error as Error).message || 'Unknown audio initialization error');
        try {
          const context = getAudioContext();
          setAudioContextState(context.state);
        } catch (contextError) {
          console.warn('[App.tsx] Could not get AudioContext state after init error:', contextError);
        }
      }
    };

    void initAudio();

    return () => {
      try {
        const context = getAudioContext();
        context.onstatechange = null;
      } catch (e) {
        console.warn('[App.tsx] Could not clean up audio context listener:', e);
      }
    };
  }, []);

  const handleResumeAudio = useCallback(async () => {
    try {
      await ensureAudioContextResumed();
      const context = getAudioContext();
      setAudioContextState(context.state);
      if (context.state === 'running') {
        setAudioError(null);
        if (!audioInitialized) {
          console.log('[App.tsx] AudioContext resumed. Consider re-triggering audio setup if needed.');
        }
      }
    } catch (err) {
      console.warn('[App.tsx] Error resuming audio context on click:', err);
      setAudioError((err as Error).message || 'Failed to resume audio context.');
      try {
        const context = getAudioContext();
        setAudioContextState(context.state);
      } catch (contextError) {
        console.warn('[App.tsx] Could not get AudioContext state after resume error:', contextError);
      }
    }
  }, [audioInitialized]);

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Feedbacker</h1>
      <div className="card">
        <button onClick={() => { setCount((c) => c + 1); }}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
        {audioError && (
          <p style={{ color: 'red' }}>Audio Error: {audioError}</p>
        )}
        {audioInitialized && !audioError && (
          <p style={{ color: 'green' }}>Audio system initialized! Context State: {audioContextState}</p>
        )}
        {!audioInitialized && !audioError && audioContextState && (
          <p>Initializing audio system... Current Context State: {audioContextState}</p>
        )}
        {audioContextState === 'suspended' && (
          <button onClick={() => { void handleResumeAudio(); }}>Resume Audio Context</button>
        )}
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
