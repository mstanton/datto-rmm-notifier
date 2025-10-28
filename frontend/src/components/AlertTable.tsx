import React, { useState } from 'react';
import { Alert } from '../types';
import { format } from 'date-fns';
import { AlertCircle, CheckCircle, Bell, Eye } from 'lucide-react';

interface AlertTableProps {
  alerts: Alert[];
  onSelectAlert: (alert: Alert) => void;
  onNotify: (alert: Alert) => void;
  onResolve: (alert: Alert) => void;
}

const AlertTable: React.FC<AlertTableProps> = ({
  alerts,
  onSelectAlert,
  onNotify,
  onResolve,
}) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-critical-100 text-critical-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-red-100 text-red-800';
      case 'notified':
        return 'bg-blue-100 text-blue-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatAlertType = (type: string) => {
    return type
      .replace(/_ctx$/, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Device / Site
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Alert Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Priority
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Detected
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {alerts.map((alert) => (
            <tr
              key={alert.id}
              className="hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelectAlert(alert)}
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {alert.device_name}
                </div>
                <div className="text-sm text-gray-500">{alert.site_name}</div>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900">
                  {formatAlertType(alert.alert_type)}
                </div>
                <div className="text-xs text-gray-500 truncate max-w-xs">
                  {alert.alert_message}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getPriorityColor(alert.priority)}`}>
                  {alert.priority}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(alert.status)}`}>
                  {alert.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {format(new Date(alert.detected_at), 'MMM dd, HH:mm')}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectAlert(alert);
                    }}
                    className="text-blue-600 hover:text-blue-900"
                    title="View details"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                  {alert.status !== 'resolved' && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onNotify(alert);
                        }}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="Send notification"
                      >
                        <Bell className="h-5 w-5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onResolve(alert);
                        }}
                        className="text-green-600 hover:text-green-900"
                        title="Resolve alert"
                      >
                        <CheckCircle className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {alerts.length === 0 && (
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No alerts found</h3>
          <p className="mt-1 text-sm text-gray-500">
            No alerts match your current filters.
          </p>
        </div>
      )}
    </div>
  );
};

export default AlertTable;
