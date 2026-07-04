import React, { useEffect, useMemo, useRef } from 'react';

/**
 * Shared animated background (mercury blobs + gooey SVG filter) used
 * behind both the auth screen and the main trading dashboard, so the
 * app has one consistent look instead of two different pages.
 */
const NeuralBackground: React.FC = () => {
    const blobsData = useMemo(() => {
        return Array.from({ length: 6 }).map(() => ({
            size: Math.random() * 200 + 150,
            left: Math.random() * 80 + 10,
            top: Math.random() * 80 + 10,
            animationDelay: Math.random() * -20,
            animationDuration: Math.random() * 15 + 15,
        }));
    }, []);

    const blobRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const x = e.clientX / window.innerWidth;
            const y = e.clientY / window.innerHeight;
            blobRefs.current.forEach((blob, index) => {
                if (blob) {
                    const speed = (index + 1) * 20;
                    blob.style.marginLeft = `${x * speed}px`;
                    blob.style.marginTop = `${y * speed}px`;
                }
            });
        };
        document.addEventListener('mousemove', handleMouseMove);
        return () => document.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <>
            <style>{`
        .neural-bg-stage {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          filter: url('#gooey-shared');
          opacity: 0.5;
          pointer-events: none;
          background-color: #050505;
        }

        .neural-bg-blob {
          position: absolute;
          background: linear-gradient(135deg, #e0e0e0, #888);
          border-radius: 50%;
          filter: blur(20px);
          animation: neural-float 20s infinite alternate ease-in-out;
          box-shadow: inset -10px -10px 20px rgba(0,0,0,0.5),
                      10px 10px 30px rgba(255,255,255,0.15);
          transition: margin 0.1s ease-out;
        }

        @keyframes neural-float {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(10vw, 20vh) scale(1.2); }
          66% { transform: translate(-5vw, 10vh) scale(0.8); }
          100% { transform: translate(5vw, -10vh) scale(1.1); }
        }
      `}</style>

            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <defs>
                    <filter id="gooey-shared">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
                        <feColorMatrix
                            in="blur"
                            mode="matrix"
                            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
                            result="goo"
                        />
                        <feComposite in="SourceGraphic" in2="goo" operator="atop" />
                    </filter>
                </defs>
            </svg>

            <div className="neural-bg-stage">
                {blobsData.map((data, index) => (
                    <div
                        key={index}
                        ref={(el) => { blobRefs.current[index] = el; }}
                        className="neural-bg-blob"
                        style={{
                            width: `${data.size}px`,
                            height: `${data.size}px`,
                            left: `${data.left}%`,
                            top: `${data.top}%`,
                            animationDelay: `${data.animationDelay}s`,
                            animationDuration: `${data.animationDuration}s`,
                        }}
                    />
                ))}
            </div>
        </>
    );
};

export default NeuralBackground;