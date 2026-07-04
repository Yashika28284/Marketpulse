import * as React from 'react';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, ChevronDown, TrendingUp, TrendingDown, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

type DepthLevel = { price: number; qty: number; orders: number };
type Depth = { bids: DepthLevel[]; asks: DepthLevel[] } | undefined;

type StockPortfolioCardProps = {
    symbols: string[];
    token: string;
    depthBySymbol: Record<string, Depth>;
    onAuthError?: () => void;
    className?: string;
};

type OrderType = 'market' | 'limit';
type PendingSide = 'buy' | 'sell' | null;

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

/** Best available price for a symbol: midpoint if both sides quote, else whichever side exists. */
function midOrBest(depth: Depth): number {
    const bid = depth?.bids?.[0]?.price;
    const ask = depth?.asks?.[0]?.price;
    if (bid && ask) return (bid + ask) / 2;
    return bid ?? ask ?? 0;
}

const HoldingRow: React.FC<{
    symbol: string;
    shares: number;
    price: number;
    busy: boolean;
    onTrade: (symbol: string, side: 'buy' | 'sell', qty: number, type: OrderType, limitPrice: number | null) => void;
}> = ({ symbol, shares, price, busy, onTrade }) => {
    const isLong = shares > 0;
    const isShort = shares < 0;

    // Which action panel (buy or sell) is currently expanded for this row.
    // Null = collapsed, showing just the two pill buttons.
    const [pendingSide, setPendingSide] = useState<PendingSide>(null);
    const [qty, setQty] = useState(1);
    const [orderType, setOrderType] = useState<OrderType>('market');
    // Seeded from the live market price when the panel opens, then freely
    // editable — this is what actually gets sent for a limit order.
    const [limitPrice, setLimitPrice] = useState<string>('');

    function openPanel(side: 'buy' | 'sell') {
        // Clicking the same side again collapses it back; clicking the other
        // side switches straight over instead of requiring two clicks.
        setPendingSide((current) => (current === side ? null : side));
        setQty(1);
        setOrderType('market');
        setLimitPrice(price > 0 ? price.toFixed(2) : '');
    }

    function confirm() {
        if (qty < 1) return;
        if (orderType === 'limit') {
            const parsed = Number(limitPrice);
            if (!parsed || parsed <= 0) return;
            onTrade(symbol, pendingSide as 'buy' | 'sell', qty, 'limit', parsed);
        } else {
            onTrade(symbol, pendingSide as 'buy' | 'sell', qty, 'market', null);
        }
        setPendingSide(null);
        setQty(1);
    }

    const effectivePrice = orderType === 'limit' ? Number(limitPrice) || 0 : price;
    const estCost = qty * effectivePrice;

    return (
        <div className="py-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div>
                        <p className="font-semibold text-card-foreground">{symbol}</p>
                        <p className={cn(
                            'text-sm text-muted-foreground',
                            isLong && 'text-green-500',
                            isShort && 'text-red-500'
                        )}>
                            {shares === 0 ? 'No shares held' : `${Math.abs(shares)} share${Math.abs(shares) === 1 ? '' : 's'} held · ${isLong ? 'Long' : 'Short'}`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="font-semibold text-card-foreground">
                            {price > 0 ? formatCurrency(price) : '—'}
                        </p>
                        <div className={cn('flex items-center justify-end gap-1 text-xs', isLong ? 'text-green-500' : isShort ? 'text-red-500' : 'text-muted-foreground')}>
                            {isLong && <TrendingUp className="h-3 w-3" />}
                            {isShort && <TrendingDown className="h-3 w-3" />}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            disabled={busy}
                            onClick={() => openPanel('buy')}
                            className={cn(
                                'rounded-md border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400 hover:bg-green-500/20 disabled:opacity-40',
                                pendingSide === 'buy' && 'bg-green-500/25 ring-1 ring-green-500/50'
                            )}
                        >
                            Buy
                        </button>
                        <button
                            disabled={busy}
                            onClick={() => openPanel('sell')}
                            className={cn(
                                'rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-40',
                                pendingSide === 'sell' && 'bg-red-500/25 ring-1 ring-red-500/50'
                            )}
                        >
                            Sell
                        </button>
                    </div>
                </div>
            </div>

            {/* Inline order panel — same card surface, no popup/modal. Only one
          side (buy or sell) can be open per row at a time. Market vs
          Limit toggle controls whether the price field is editable. */}
            <AnimatePresence initial={false}>
                {pendingSide && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <div className={cn(
                            'mt-3 rounded-lg border p-3 space-y-3',
                            pendingSide === 'buy' ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
                        )}>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    {pendingSide === 'buy' ? 'Buy' : 'Sell'} {symbol}
                                </span>

                                {/* Market / Limit toggle */}
                                <div className="flex rounded-md border border-border overflow-hidden text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setOrderType('market')}
                                        className={cn(
                                            'px-2.5 py-1 font-medium',
                                            orderType === 'market' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted'
                                        )}
                                    >
                                        Market
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setOrderType('limit')}
                                        className={cn(
                                            'px-2.5 py-1 font-medium border-l border-border',
                                            orderType === 'limit' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted'
                                        )}
                                    >
                                        Limit
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 flex-wrap">
                                {/* Quantity stepper */}
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
                                    >
                                        <Minus className="h-3 w-3" />
                                    </button>
                                    <input
                                        type="number"
                                        min={1}
                                        value={qty}
                                        onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                                        className="w-14 rounded-md border border-border bg-background px-2 py-1 text-center text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setQty((q) => q + 1)}
                                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
                                    >
                                        <Plus className="h-3 w-3" />
                                    </button>
                                </div>

                                {/* Price — editable only for Limit orders */}
                                {orderType === 'limit' ? (
                                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                        Price
                                        <input
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={limitPrice}
                                            onChange={(e) => setLimitPrice(e.target.value)}
                                            placeholder={price > 0 ? price.toFixed(2) : '0.00'}
                                            className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                                        />
                                    </label>
                                ) : (
                                    <span className="text-xs text-muted-foreground">
                                        at market {price > 0 ? `(≈ ${formatCurrency(price)})` : ''}
                                    </span>
                                )}

                                <span className="text-xs text-muted-foreground ml-auto sm:ml-0">
                                    {effectivePrice > 0 ? `Est. ${formatCurrency(estCost)}` : ''}
                                </span>
                            </div>

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPendingSide(null)}
                                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || (orderType === 'limit' && (!Number(limitPrice) || Number(limitPrice) <= 0))}
                                    onClick={confirm}
                                    className={cn(
                                        'rounded-md px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40',
                                        pendingSide === 'buy' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'
                                    )}
                                >
                                    {busy ? 'Placing...' : `Confirm ${pendingSide === 'buy' ? 'Buy' : 'Sell'}`}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const StockPortfolioCard: React.FC<StockPortfolioCardProps> = ({
    symbols,
    token,
    depthBySymbol,
    onAuthError,
    className,
}) => {
    const [summary, setSummary] = useState<{
        positions: Record<string, number>;
        exposure: number;
        exposureLimit: number;
    } | null>(null);
    const [tradeStatus, setTradeStatus] = useState<string | null>(null);
    const [busySymbol, setBusySymbol] = useState<string | null>(null);
    const fetchSummaryRef = React.useRef<() => void>(() => { });

    useEffect(() => {
        if (!token) return;
        const fetchSummary = () => {
            fetch(`${API_URL}/account`, { headers: { Authorization: `Bearer ${token}` } })
                .then(async (r) => {
                    if (r.status === 401) {
                        onAuthError?.();
                        return null;
                    }
                    if (!r.ok) return null;
                    return r.json();
                })
                .then((data) => { if (data) setSummary(data); })
                .catch(() => { });
        };
        fetchSummaryRef.current = fetchSummary;
        fetchSummary();
        const id = setInterval(fetchSummary, 3000);
        return () => clearInterval(id);
    }, [token, onAuthError]);

    async function handleTrade(symbol: string, side: 'buy' | 'sell', qty: number, type: OrderType, limitPrice: number | null) {
        setBusySymbol(symbol);
        setTradeStatus(null);
        try {
            const res = await fetch(`${API_URL}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ symbol, side, type, price: type === 'limit' ? limitPrice : null, stopPrice: null, qty }),
            });
            const data = await res.json();
            if (res.status === 401) { onAuthError?.(); return; }
            if (!res.ok) {
                setTradeStatus(`Error: ${data.error}`);
                return;
            }

            const priceNote = type === 'limit' ? ` @ ${formatCurrency(limitPrice as number)}` : '';
            const verb = side === 'buy' ? 'Bought' : 'Sold';

            // The order endpoint can hand back a few different shapes
            // depending on how the engine is run — a queued order (Kafka
            // path, `status: 'pending'`) hasn't matched yet at all, and
            // even the synchronous path can come back 'cancelled' (no
            // liquidity for a market order) or 'partial'. Saying "Bought"
            // regardless of which of these happened is what made the UI
            // claim a fill that never actually landed.
            switch (data.status) {
                case 'pending':
                    setTradeStatus(`Order queued: ${side} ${qty} ${symbol}${priceNote} — it'll show up in Trade Prints once it matches`);
                    break;
                case 'filled':
                    setTradeStatus(`${verb} ${qty} ${symbol}${priceNote}`);
                    break;
                case 'partial': {
                    const filledQty = qty - (data.remaining ?? 0);
                    setTradeStatus(`Partial fill: ${verb.toLowerCase()} ${filledQty} of ${qty} ${symbol}${priceNote} — ${data.remaining} unfilled`);
                    break;
                }
                case 'cancelled':
                    setTradeStatus(
                        type === 'market'
                            ? `No fill — no matching ${side === 'buy' ? 'sellers' : 'buyers'} for ${symbol} right now, order was cancelled`
                            : `Order cancelled`
                    );
                    break;
                case 'open':
                    setTradeStatus(`Order placed — resting in the book${priceNote}, not filled yet`);
                    break;
                case 'rejected':
                    setTradeStatus(`Rejected: ${data.rejectReason || 'risk check failed'}`);
                    break;
                default:
                    setTradeStatus(`${verb} ${qty} ${symbol}${priceNote}`);
            }

            // A fill changes positions/exposure immediately — refresh now
            // instead of waiting up to 3s for the next poll to catch up.
            fetchSummaryRef.current();
        } catch (err: any) {
            setTradeStatus(`Error: ${err.message}`);
        } finally {
            setBusySymbol(null);
        }
    }

    const exposure = summary?.exposure ?? 0;
    const exposureLimit = summary?.exposureLimit ?? 0;
    const utilizationPct = exposureLimit ? (exposure / exposureLimit) * 100 : 0;
    const isHighUtilization = utilizationPct >= 80;

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
    };
    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 100 } },
    };

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className={cn(
                'w-full rounded-xl border bg-card text-card-foreground shadow-sm p-6 space-y-6',
                className
            )}
        >
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div>
                    <p className="text-sm text-muted-foreground">Account exposure</p>
                    <h2 className="text-4xl font-bold tracking-tight">{formatCurrency(exposure)}</h2>
                    <div className={cn(
                        'mt-1 flex items-center gap-2 text-sm font-medium',
                        isHighUtilization ? 'text-red-500' : 'text-green-500'
                    )}>
                        {isHighUtilization ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {utilizationPct.toFixed(1)}% of limit used
                    </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2 sm:mt-0">
                    Limit {formatCurrency(exposureLimit)}
                </p>
            </motion.div>

            <motion.div variants={itemVariants}>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">Markets</h3>
                </div>
                <div className="divide-y divide-border">
                    {symbols.map((symbol) => (
                        <HoldingRow
                            key={symbol}
                            symbol={symbol}
                            shares={summary?.positions?.[symbol] ?? 0}
                            price={midOrBest(depthBySymbol[symbol])}
                            busy={busySymbol === symbol}
                            onTrade={handleTrade}
                        />
                    ))}
                </div>
                {tradeStatus && <p className="mt-3 text-xs text-muted-foreground">{tradeStatus}</p>}
            </motion.div>
        </motion.div>
    );
};

export default StockPortfolioCard;