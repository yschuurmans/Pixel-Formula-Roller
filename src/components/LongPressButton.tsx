import { useCallback, useEffect, useRef } from 'react';

type LongPressButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  onClick?: () => void;
  onLongPress?: () => void;
  longPressMs?: number;
};

export default function LongPressButton({
  onClick,
  onLongPress,
  longPressMs = 400,
  disabled,
  type = 'button',
  ...props
}: LongPressButtonProps) {
  const pressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const clearPressTimer = useCallback(() => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPressTimer(), [clearPressTimer]);

  const handlePressStart = useCallback(() => {
    if (disabled || !onLongPress) {
      return;
    }

    clearPressTimer();
    suppressClickRef.current = false;
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      suppressClickRef.current = true;
      onLongPress();
    }, longPressMs);
  }, [clearPressTimer, disabled, longPressMs, onLongPress]);

  const handlePressEnd = useCallback(() => {
    clearPressTimer();
  }, [clearPressTimer]);

  const handleClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    onClick?.();
  }, [onClick]);

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressEnd}
      onClick={handleClick}
    />
  );
}