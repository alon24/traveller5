import { Bell, Trash2 } from 'lucide-react';
import { useAlertStore } from '../../stores/useAlertStore';
import { format } from 'date-fns';

export default function AlertCard({ alert }) {
  const removeAlert = useAlertStore((s) => s.removeAlert);

  return (
    <div className={`bg-gray-800 rounded-xl p-4 flex items-start gap-3 ${alert.fired ? 'opacity-50' : ''}`}>
      <Bell size={18} className={alert.fired ? 'text-gray-500' : 'text-blue-400'} />
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{alert.label || 'Trip alert'}</p>
        <p className="text-gray-400 text-sm mt-0.5">
          Notify {alert.notifyMinutesBefore} min before · {alert.notifyAt ? format(new Date(alert.notifyAt), 'HH:mm EEE d MMM') : '—'}
        </p>
        {alert.fired && <p className="text-gray-500 text-xs mt-1">Already fired</p>}
      </div>
      <button
        onClick={() => removeAlert(alert.id)}
        className="text-gray-500 hover:text-red-400 transition-colors p-1"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
