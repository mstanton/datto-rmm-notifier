import React, { useState, useEffect } from 'react';
import { X, Mail, MessageSquare, Send } from 'lucide-react';
import { Alert, Contact } from '../types';
import { contactsAPI } from '../api/contacts';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  alert: Alert | null;
  onSend: (contactIds: string[], type: 'email' | 'sms' | 'both', customMessage: string) => void;
}

const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  alert,
  onSend,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [notificationType, setNotificationType] = useState<'email' | 'sms' | 'both'>('email');
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && alert) {
      loadContacts();
    }
  }, [isOpen, alert]);

  const loadContacts = async () => {
    if (!alert) return;

    try {
      setLoading(true);
      const response = await contactsAPI.getContactsBySite(alert.site_uid);
      setContacts(response.data);

      // Auto-select all contacts
      setSelectedContacts(response.data.map(c => c.id));
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    if (selectedContacts.length === 0) {
      alert('Please select at least one contact');
      return;
    }

    onSend(selectedContacts, notificationType, customMessage);
    onClose();
  };

  const toggleContact = (contactId: string) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  if (!isOpen || !alert) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black opacity-30" onClick={onClose}></div>

        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Send Notification</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-900">{alert.device_name}</h3>
            <p className="text-sm text-gray-600">{alert.site_name}</p>
            <p className="text-sm text-gray-600 mt-1">{alert.alert_message}</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notification Type
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="email"
                  checked={notificationType === 'email'}
                  onChange={(e) => setNotificationType(e.target.value as any)}
                  className="mr-2"
                />
                <Mail className="h-4 w-4 mr-1" />
                Email
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="sms"
                  checked={notificationType === 'sms'}
                  onChange={(e) => setNotificationType(e.target.value as any)}
                  className="mr-2"
                />
                <MessageSquare className="h-4 w-4 mr-1" />
                SMS
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="both"
                  checked={notificationType === 'both'}
                  onChange={(e) => setNotificationType(e.target.value as any)}
                  className="mr-2"
                />
                Both
              </label>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recipients ({selectedContacts.length} selected)
            </label>
            <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-lg p-2">
              {loading ? (
                <p className="text-sm text-gray-500">Loading contacts...</p>
              ) : contacts.length === 0 ? (
                <p className="text-sm text-gray-500">No contacts found for this site</p>
              ) : (
                contacts.map(contact => (
                  <label key={contact.id} className="flex items-center p-2 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                      className="mr-3"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{contact.name}</div>
                      <div className="text-xs text-gray-500">
                        {contact.email}
                        {contact.phone && ` • ${contact.phone}`}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Custom Message (Optional)
            </label>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg p-2"
              placeholder="Add any additional information for the client..."
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={selectedContacts.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Send className="h-4 w-4 mr-2" />
              Send Notification
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;
