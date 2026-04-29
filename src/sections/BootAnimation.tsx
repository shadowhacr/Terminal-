import React, { useEffect, useRef, useState } from 'react';
import './BootAnimation.css';

interface BootAnimationProps {
  onComplete: () => void;
}

const BootAnimation: React.FC<BootAnimationProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bootPhase, setBootPhase] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [showShadow, setShowShadow] = useState(false);

  const bootLines = [
    '[ OK ] Initializing kernel...',
    '[ OK ] Loading system modules...',
    '[ OK ] Mounting file systems...',
    '[ OK ] Starting network services...',
    '[ OK ] Loading Shadow Protocol...',
    '[ OK ] Establishing secure connection...',
    '[ OK ] Bypassing security layers...',
    '[ OK ] Access granted...',
    '[ OK ] Welcome to Shadow Terminal...',
  ];

  // Matrix rain effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%^&*()_+-=[]{}|;:,.<>?/~`';
    const charArray = chars.split('');
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops: number[] = [];

    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -100;
    }

    let animationId: number;
    const drawMatrix = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#00ff41';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = charArray[Math.floor(Math.random() * charArray.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }

      animationId = requestAnimationFrame(drawMatrix);
    };

    drawMatrix();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Boot sequence typing
  useEffect(() => {
    let lineIndex = 0;
    let charIndex = 0;
    let currentText = '';

    const typeInterval = setInterval(() => {
      if (lineIndex < bootLines.length) {
        if (charIndex < bootLines[lineIndex].length) {
          currentText += bootLines[lineIndex][charIndex];
          setDisplayText(currentText);
          charIndex++;
        } else {
          currentText += '\n';
          setDisplayText(currentText);
          lineIndex++;
          charIndex = 0;
          setBootPhase(lineIndex);
        }
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          setShowShadow(true);
          setTimeout(() => {
            onComplete();
          }, 3000);
        }, 800);
      }
    }, 100);

    return () => clearInterval(typeInterval);
  }, [onComplete]);

  return (
    <div className="boot-container">
      <canvas ref={canvasRef} className="matrix-canvas" />
      <div className="boot-content">
        <div className="boot-text">
          <pre className="boot-lines">{displayText}</pre>
          <span className="boot-cursor">_</span>
        </div>
        
        {bootPhase >= 3 && (
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(bootPhase / bootLines.length) * 100}%` }}
              />
            </div>
            <div className="progress-text">
              {Math.round((bootPhase / bootLines.length) * 100)}%
            </div>
          </div>
        )}

        <div className={`shadow-title-container ${showShadow ? 'visible' : ''}`}>
          <h1 className="shadow-title">
            <span className="glitch" data-text="SHADOW">SHADOW</span>
          </h1>
          <h2 className="shadow-subtitle">TERMINAL</h2>
          <div className="shadow-line" />
          <p className="shadow-tagline">
            <span className="typing-text">Access the void. Control everything.</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default BootAnimation;
