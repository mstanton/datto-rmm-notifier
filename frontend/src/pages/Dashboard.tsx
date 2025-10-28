import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Search, Filter } from 'lucide-react';
import AlertTable from '../components/AlertTable';
import NotificationModal from '../components/NotificationModal';
import { Alert, AlertFilters, Statistics } from '../types';
import { alertsAPI } from '../api/alerts';
import { notificationsAPI } from '../api/notifications';

const Dashboard: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [filters, setFilters] = useState<AlertFilters>({
    status: ['open', 'notified'],
    page: 1,
    limit: 50,
  });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [alertToNotify, setAlertToNotify] = useState<Alert | null>(null);

  useEffect(() => {
    loadAlerts();
    loadStatistics();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadAlerts();
      loadStatistics();
    }, 30000);

    return () => clearInterval(interval);
  }, [filters]);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const response = await alertsAPI.getAlerts(filters);
      setAlerts(response.data);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await alertsAPI.getStatistics();
      setStatistics(response.data);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const handleSearch = () => {
    setFilters(prev => ({ ...prev, search: searchTerm, page: 1 }));
  };

  const handleManualPoll = async () => {
    try {
      setLoading(true);
      await alertsAPI.manualPoll();
      await loadAlerts();
      await loadStatistics();
    } catch (error) {
      console.error('Failed to poll alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotify = (alert: Alert) => {
    setAlertToNotify(alert);
    setNotificationModalOpen(true);
  };

  const handleSendNotification = async (
    contactIds: string[],
    type: 'email' | 'sms' | 'both',
    customMessage: string
  ) => {
    if (!alertToNotify) return;

    try {
      await notificationsAPI.sendNotification(alertToNotify.id, {
        contactIds,
        type,
        customMessage,
      });

      // Refresh alerts
      await loadAlerts();
      alert('Notification sent successfully!');
    } catch (error) {
      console.error('Failed to send notification:', error);
      alert('Failed to send notification');
    }
  };

  const handleResolve = async (alert: Alert) => {
    const notes = prompt('Resolution notes (optional):');
    if (notes === null) return;

    try {
      await alertsAPI.resolveAlert(alert.id, notes);
      await loadAlerts();
      await loadStatistics();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
      alert('Failed to resolve alert');
    }
  };

  const toggleStatusFilter = (status: string) => {
    setFilters(prev => {
      const currentStatuses = prev.status || [];
      const newStatuses = currentStatuses.includes(status)
        ? currentStatuses.filter(s => s !== status)
        : [...currentStatuses, status];

      return { ...prev, status: newStatuses, page: 1 };
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <AlertTriangle className="h-8 w-8 mr-2 text-critical-600" />
                Datto RMM Alert Notifier
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Critical alert monitoring and notification system
              </p>
            </div>
            <button
              onClick={handleManualPoll}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {statistics && (
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="text-sm font-medium text-gray-500">Total Alerts</div>
                  <div className="mt-1 text-3xl font-semibold text-gray-900">
                    {statistics.total}
                  </div>
                </div>
              </div>
              <div className="bg-critical-50 overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="text-sm font-medium text-critical-700">Critical</div>
                  <div className="mt-1 text-3xl font-semibold text-critical-900">
                    {statistics.critical}
                  </div>
                </div>
              </div>
              <div className="bg-red-50 overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="text-sm font-medium text-red-700">Open</div>
                  <div className="mt-1 text-3xl font-semibold text-red-900">
                    {statistics.open}
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="text-sm font-medium text-blue-700">Notified</div>
                  <div className="mt-1 text-3xl font-semibold text-blue-900">
                    {statistics.notified}
                  </div>
                </div>
              </div>
              <div className="bg-green-50 overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="text-sm font-medium text-green-700">Resolved</div>
                  <div className="mt-1 text-3xl font-semibold text-green-900">
                    {statistics.resolved}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search alerts..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Search
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <Filter className="h-5 w-5 text-gray-500" />
                <span className="text-sm text-gray-700">Status:</span>
                {['open', 'notified', 'resolved'].map(status => (
                  <button
                    key={status}
                    onClick={() => toggleStatusFilter(status)}
                    className={`px-3 py-1 rounded-full text-sm ${
                      filters.status?.includes(status)
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <AlertTable
            alerts={alerts}
            onSelectAlert={setSelectedAlert}
            onNotify={handleNotify}
            onResolve={handleResolve}
          />
        </div>
      </div>

      <NotificationModal
        isOpen={notificationModalOpen}
        onClose={() => setNotificationModalOpen(false)}
        alert={alertToNotify}
        onSend={handleSendNotification}
      />
    </div>
  );
};

export default Dashboard;
