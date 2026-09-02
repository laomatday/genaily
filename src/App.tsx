import React, { useState, useEffect } from 'react';
import { ParentDashboard } from './features/parent/ParentDashboard';
import { ChildApp } from './features/child/ChildApp';

export default function App() {
  const [role, setRole] = useState<'parent' | 'child'>('parent');
  const [sessionStatus, setSessionStatus] = useState<string>('scheduled'); // scheduled | awaiting_parent | approved | completed

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('role') === 'child') {
      setRole('child');
    }
  }, []);

  const handleApprove = () => {
    setSessionStatus('approved');
  };

  const handleSubmitSession = () => {
    setSessionStatus('awaiting_parent');
  };

  return (
    <div className="min-h-screen bg-[#E2E8F0]">
      {role === 'parent' ? (
        <ParentDashboard 
          sessionStatus={sessionStatus}
          onApprove={handleApprove}
          onSwitchToChild={() => setRole('child')}
        />
      ) : (
        <ChildApp 
          sessionStatus={sessionStatus}
          onSubmitSession={handleSubmitSession}
          onSwitchToParent={() => setRole('parent')}
        />
      )}
    </div>
  );
}
