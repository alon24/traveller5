import { Bell } from 'lucide-react';
import { useAlertStore } from '../stores/useAlertStore';
import AlertCard from '../components/alerts/AlertCard';
import EmptyState from '../components/common/EmptyState';

export default function AlertsPage() {
  const alerts = useAlertStore((s) => s.alerts);
  const permission = useAlertStore((s) => s.permission);
  const requestPermission = useAlertStore((s) => s.requestPermission);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-xl font-bold text-white">Departure Alerts</h1>

      {permission !== 'granted' && (
        <div className="bg-yellow-900/40 border border-yellow-700 rounded-xl p-4">
          <p className="text-yellow-300 text-sm mb-2">Enable notifications to receive departure alerts.</p>
          <button
            onClick={requestPermission}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-sm text-white transition-colors"
          >
            Enable Notifications
          </button>
        </div>
      )}

      {alerts.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alerts set"
          description="Plan a trip and tap 'Set Alert' to get notified when to leave"
        />
      ) : (
        alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
      )}
    </div>
  );
}
