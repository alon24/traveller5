import { useAlertStore } from '../../stores/useAlertStore';

const timers = new Map();

export function scheduleAllAlerts() {
  const { alerts, markFired } = useAlertStore.getState();
  const now = Date.now();

  for (const alert of alerts) {
    if (alert.fired) continue;

    const notifyAt = new Date(alert.notifyAt).getTime();
    const delay = notifyAt - now;

    if (delay < 0) {
      // Missed but within 30 minutes — show now
      if (delay > -30 * 60 * 1000) fireAlert(alert, markFired);
      continue;
    }

    if (timers.has(alert.id)) clearTimeout(timers.get(alert.id));
    const timerId = setTimeout(() => fireAlert(alert, markFired), delay);
    timers.set(alert.id, timerId);
  }
}

export function cancelAlert(id) {
  if (timers.has(id)) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }
}

function fireAlert(alert, markFired) {
  markFired(alert.id);
  timers.delete(alert.id);

  const title = 'Time to leave!';
  const body = `${alert.label || 'Your trip'} — departs in ${alert.notifyMinutesBefore} min`;

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}
