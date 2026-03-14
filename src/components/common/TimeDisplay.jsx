import { format, formatDistanceToNow } from 'date-fns';

export default function TimeDisplay({ time, countdown = false, className = '' }) {
  if (!time) return null;
  const date = new Date(time);

  return (
    <span className={`text-sm tabular-nums ${className}`}>
      {countdown
        ? formatDistanceToNow(date, { addSuffix: true })
        : format(date, 'HH:mm')}
    </span>
  );
}
