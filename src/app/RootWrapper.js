'use client';

import { ToastProvider } from '@/app/contexts/ToastContext';
import { ConfirmProvider } from '@/app/contexts/ConfirmContext';
import ToastContainer from '@/app/components/ToastContainer';
import { WebVitals } from '@/app/web-vitals';

export default function RootWrapper({ children }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <WebVitals />
        {children}
        <ToastContainer />
      </ConfirmProvider>
    </ToastProvider>
  );
}
