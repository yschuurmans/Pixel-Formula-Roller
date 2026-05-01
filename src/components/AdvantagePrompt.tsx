import { useEffect, useRef } from 'react';
import type { ProfileSkill } from '../types/profile';

type RollMode = 'disadvantage' | 'normal' | 'advantage';

function D20Icon({ accent, stacked = false, plus = false, minus = false }: { accent: string; stacked?: boolean; plus?: boolean; minus?: boolean }) {
  return (
    <div className={`relative ${stacked ? 'h-11 w-11' : 'h-11 w-11'}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" className={`absolute inset-0 h-full w-full drop-shadow-[2px_2px_0_#09070d] ${stacked ? '-translate-x-2 translate-y-1' : ''}`}>
        <polygon points="24,4 40,14 44,30 24,44 4,30 8,14" fill={accent} stroke="#f7ead4" strokeWidth="2" />
      </svg>
      {stacked ? (
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full translate-x-2 -translate-y-1 drop-shadow-[2px_2px_0_#09070d]">
          <polygon points="24,4 40,14 44,30 24,44 4,30 8,14" fill={accent} stroke="#f7ead4" strokeWidth="2" />
        </svg>
      ) : null}
      {plus ? <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#f7ead4]">+</span> : null}
      {minus ? <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-[#f7ead4]">−</span> : null}
    </div>
  );
}

export default function AdvantagePrompt({
  open,
  skill,
  modifier,
  onChoose,
  onClose,
}: {
  open: boolean;
  skill: ProfileSkill | null;
  modifier: number;
  onChoose: (mode: RollMode) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousActive = document.activeElement as HTMLElement | null;
    const focusTimeout = window.setTimeout(() => {
      const firstFocusable = containerRef.current?.querySelector<HTMLElement>('button');
      firstFocusable?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimeout);
      previousActive?.focus?.();
    };
  }, [onClose, open]);

  if (!open || !skill) {
    return null;
  }

  const displayFormula = (base: string) => {
    if (modifier === 0) {
      return base;
    }

    return `${base} ${modifier > 0 ? '+' : '-'} ${Math.abs(modifier)}`;
  };

  const options: Array<{ mode: RollMode; label: string; formula: string; tone: 'good' | 'neutral' | 'bad' }> = [
    { mode: 'advantage', label: 'Advantage', formula: displayFormula('2d20kh1'), tone: 'good' },
    { mode: 'normal', label: 'Normal', formula: displayFormula('1d20'), tone: 'neutral' },
    { mode: 'disadvantage', label: 'Disadvantage', formula: displayFormula('2d20kl1'), tone: 'bad' },
  ];

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/75" aria-hidden />

      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="character-roll-prompt-title"
          className="w-full max-w-xl border-2 border-[#8a72a8] bg-[#15111a] p-5 shadow-[8px_8px_0_0_#09070d]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#c5d7ff]">Character Check</p>
              <h2 id="character-roll-prompt-title" className="mt-3 text-sm text-[#f7ead4]">
                {skill.label}
              </h2>
              <p className="mt-2 text-[9px] text-[#c5b7d8]">Modifier {modifier >= 0 ? `+${modifier}` : modifier}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="border-2 border-[#7d6b95] bg-[#251d2e] px-3 py-2 text-[10px] text-[#f7ead4]"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {options.map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => onChoose(option.mode)}
                className={`flex flex-col items-center gap-3 border-2 px-4 py-4 text-center text-[10px] shadow-[4px_4px_0_0_#09070d] ${
                  option.tone === 'good'
                    ? 'border-[#86efac] bg-[#17301f] text-[#d7ffe5]'
                    : option.tone === 'bad'
                      ? 'border-[#ff9aa2] bg-[#35181f] text-[#ffe3e6]'
                      : 'border-[#7dd3fc] bg-[#102a3a] text-[#d9f3ff]'
                }`}
              >
                {option.mode === 'advantage' ? <D20Icon accent="#17301f" stacked plus /> : null}
                {option.mode === 'normal' ? <D20Icon accent="#102a3a" /> : null}
                {option.mode === 'disadvantage' ? <D20Icon accent="#7a1d2a" stacked minus /> : null}
                <span className="text-[11px] uppercase tracking-[0.18em]">{option.label}</span>
                <span className="font-mono text-[10px] opacity-90">{option.formula}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}