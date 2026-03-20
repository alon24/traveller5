import { Bell, Trash2 } from 'lucide-react';
import { useAlertStore } from '../../stores/useAlertStore';
import { format } from 'date-fns';

export default function AlertCard({ alert }) {
  const removeAlert = useAlertStore((s) => s.removeAlert);

  return (
    <div className={`bg-gray-100 rounded-xl p-4 flex items-start gap-1.5 ${alert.fired ? 'opacity-50' : ''}`}>
      <Bell size={18} className={alert.fired ? 'text-gray-500' : 'text-blue-400'} />
      <div className="flex-1 min-w-0">
        <p className="text-gray-900 font-medium truncate">{alert.label || 'Trip alert'}</p>
        <p className="text-gray-600 text-sm mt-0.5">
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
