'use client';

import { ToastProvider } from '@/app/contexts/ToastContext';
import ToastContainer from '@/app/components/ToastContainer';

export default function RootWrapper({ children }) {
  return (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
}
