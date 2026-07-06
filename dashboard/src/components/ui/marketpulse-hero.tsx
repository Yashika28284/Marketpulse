import React, { useMemo } from 'react';
import NeuralBackground from './neural-background';

// Monochrome "mercury" palette — matches the Neural Access login screen
// (Inter for display type, Space Mono for labels/data, no neon green).
const ACCENT = '#ffffff';
const MERCURY = '#e0e0e0';
const DIM = 'rgba(255,255,255,0.5)';
const SANS = "'Inter', sans-serif";
const MONO = "'Space Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// Real, verifiable talking points (from the engine's own README/tests)
// instead of invented throughput/uptime numbers — this is a matching
// engine you can run and benchmark yourself, not a hosted service with
// an SLA to point to.
const METRICS = [
    { value: 'Price-Time Priority', label: 'MATCHING MODEL' },
    { value: 'Pre-Trade Risk Checks', label: 'EXPOSURE & POSITION LIMITS' },
    { value: '46 Tests · CI on Every Push', label: 'VERIFIED, NOT JUST CLAIMED' },
];

// Full reload (not a client-side route) — main.jsx picks the view once,
// on initial load, based on window.location.hash, same pattern the old
// hero used for "Join Now" / Login.
function goToAuth(mode: 'login' | 'register') {
    sessionStorage.setItem('marketpulse_prefill', JSON.stringify({ mode, email: '' }));
    window.location.href = '#dashboard';
    window.location.reload();
}

// Deterministic candlestick silhouette for the background — decorative
// market-grid texture, generated once (not on every render) and not
// meant to represent real price data.
function useCandles(count: number) {
    return useMemo(() => {
        let last = 50;
        return Array.from({ length: count }).map((_, i) => {
            const drift = (Math.sin(i * 1.7) + Math.sin(i * 0.6)) * 6;
            const open = last;
            const close = Math.max(10, Math.min(90, open + drift));
            last = close;
            const up = close >= open;
            const wickTop = Math.max(0, Math.min(open, close) - Math.abs(drift) * 0.6 - 4);
            const wickBottom = Math.min(100, Math.max(open, close) + Math.abs(drift) * 0.6 + 4);
            return {
                x: (i + 0.5) * (400 / count),
                bodyTop: Math.min(open, close),
                bodyHeight: Math.max(2, Math.abs(close - open)),
                wickTop,
                wickBottom,
                up,
            };
        });
    }, [count]);
}

const MarketPulseHero: React.FC = () => {
    const candles = useCandles(28);

    return (
        <main
            className="fixed inset-0 flex flex-col overflow-hidden"
            style={{ background: '#050505', color: '#fff', fontFamily: SANS }}
        >
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;800&family=Space+Mono&display=swap');`}</style>
            <NeuralBackground />

            {/* Market-grid signature: a faint candlestick horizon along the
          bottom of the screen, grounding the neon-green tech look in
          the actual subject (an order matching engine). */}
            <svg
                className="pointer-events-none absolute bottom-0 left-0 w-full"
                style={{ height: '34%', opacity: 0.22, zIndex: 1 }}
                viewBox="0 0 400 100"
                preserveAspectRatio="none"
            >
                {candles.map((c, i) => (
                    <g key={i}>
                        <line x1={c.x} y1={c.wickTop} x2={c.x} y2={c.wickBottom} stroke={MERCURY} strokeWidth={0.5} />
                        <rect
                            x={c.x - 3}
                            y={c.bodyTop}
                            width={6}
                            height={c.bodyHeight}
                            fill={MERCURY}
                            opacity={c.up ? 0.85 : 0.3}
                        />
                    </g>
                ))}
            </svg>

            <div className="relative z-10 flex h-full w-full flex-col">
                <div className="mx-auto flex h-full w-full max-w-md flex-col px-6">
                    {/* Header */}
                    <div className="flex items-center justify-between pt-6">
                        <span
                            className="text-[10px] tracking-[0.3em] uppercase"
                            style={{ color: DIM, fontFamily: MONO }}
                        >
                            MarketPulse
                        </span>
                        <button
                            onClick={() => goToAuth('login')}
                            className="rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors hover:bg-white/10"
                            style={{ borderColor: 'rgba(255,255,255,0.25)', color: '#fff', fontFamily: SANS }}
                        >
                            Login
                        </button>
                    </div>

                    {/* Hero content */}
                    <div className="flex flex-1 flex-col items-center justify-center gap-9 text-center">
                        <div>
                            <h1
                                className="leading-[0.9]"
                                style={{
                                    fontFamily: SANS,
                                    fontWeight: 800,
                                    fontSize: 'clamp(2.75rem, 12vw, 3.5rem)',
                                    letterSpacing: '-0.04em',
                                }}
                            >
                                MARKET<span style={{ color: MERCURY }}>PULSE</span>
                            </h1>
                            <p
                                className="mx-auto mt-5 max-w-xs text-sm sm:text-base"
                                style={{ color: DIM, lineHeight: 1.6 }}
                            >
                                A price-time priority matching engine with a live order book,
                                pre-trade risk checks, and real-time trade prints — built the
                                way real trading venues are, from the ground up.
                            </p>
                        </div>

                        <button
                            onClick={() => goToAuth('register')}
                            className="w-full rounded-full py-4 text-xs font-extrabold uppercase tracking-[0.2em] transition-all hover:tracking-[0.3em] active:scale-[0.98]"
                            style={{ background: ACCENT, color: '#000', fontFamily: SANS }}
                        >
                            Get Started
                        </button>

                        <div className="flex w-full flex-col gap-3" style={{ fontFamily: MONO }}>
                            {METRICS.map((m) => (
                                <div
                                    key={m.label}
                                    className="flex items-baseline justify-between border-t pt-3"
                                    style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                                >
                                    <span
                                        className="text-left text-sm font-bold sm:text-base"
                                        style={{ color: MERCURY, fontFamily: SANS }}
                                    >
                                        {m.value}
                                    </span>
                                    <span
                                        className="text-right text-[10px] tracking-[0.15em] uppercase"
                                        style={{ color: DIM }}
                                    >
                                        {m.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pb-6" />
                </div>
            </div>
        </main>
    );
};

export default MarketPulseHero;