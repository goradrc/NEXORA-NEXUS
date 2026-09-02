'use client';

import React, { useState, useEffect } from 'react';
import { localDb } from '../../offline/db';

export const NetworkStatusBadge: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    const interval = setInterval(() => {
      const pending = localDb.syncQueue.filter(m => m.status === 'PENDING').length;
      setPendingCount(pending);
    }, 1000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      clearInterval(interval);
    };
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 500 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 12,
          backgroundColor: isOnline ? '#e6f4ea' : '#fce8e6',
          color: isOnline ? '#137333' : '#c5221f',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isOnline ? '#137333' : '#c5221f',
          }}
        />
        {isOnline ? 'En ligne' : 'Hors-ligne'}
      </span>

      {pendingCount > 0 && (
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 12,
            backgroundColor: '#fef7e0',
            color: '#b06000',
            fontSize: 12,
          }}
        >
          🔄 Sync: {pendingCount} mutation(s) en attente
        </span>
      )}
    </div>
  );
};
