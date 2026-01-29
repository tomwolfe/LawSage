'use client';

import { useEffect, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ClientPortalProps {
  children: ReactNode;
  selector: string;
}

export default function ClientPortal({ children, selector }: ClientPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => {
      clearTimeout(timer);
      setMounted(false);
    };
  }, []);

  if (!mounted) return null;

  const element = document.querySelector(selector);
  return element ? createPortal(children, element) : null;
}
