import React, { useState, useCallback } from 'react';
import BootAnimation from './sections/BootAnimation';
import Terminal from './sections/Terminal';

export default function App() {
  const [bootComplete, setBootComplete] = useState(false);

  const handleBootComplete = useCallback(() => {
    setBootComplete(true);
  }, []);

  return (
    <div style={{ background: '#000', minHeight: '100vh', margin: 0, padding: 0 }}>
      {!bootComplete && <BootAnimation onComplete={handleBootComplete} />}
      {bootComplete && <Terminal />}
    </div>
  );
}
