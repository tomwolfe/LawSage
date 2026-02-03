'use client';

import React, { useEffect, useState } from 'react';
import { getRemainingCredits, getDailyQuota, getTokenUsage } from '../src/utils/token-budget';

const TokenBudgetDisplay: React.FC = () => {
  const [credits, setCredits] = useState<number>(20);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const usage = getTokenUsage();
    setCredits(getDailyQuota() - usage.count);

    // Update credits every minute or when storage changes
    const handleStorageChange = () => {
      const updatedUsage = getTokenUsage();
      setCredits(getDailyQuota() - updatedUsage.count);
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Custom event for internal updates
    window.addEventListener('tokenUsageUpdated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('tokenUsageUpdated', handleStorageChange);
    };
  }, []);

  if (!isMounted) return null;

  const percentage = (credits / getDailyQuota()) * 100;
  const isLow = credits <= 5;
  const isCritical = credits <= 2;

  return (
    <div className="flex flex-col gap-1 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
      <div className="flex justify-between items-center text-xs font-medium">
        <span className="text-slate-500 dark:text-slate-400">Daily Analysis Credits</span>
        <span className={isCritical ? "text-red-500" : isLow ? "text-amber-500" : "text-emerald-500"}>
          {credits} / {getDailyQuota()}
        </span>
      </div>
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${isCritical ? "bg-red-500" : isLow ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {credits === 0 && (
        <p className="text-[10px] text-red-500 mt-1">Daily quota reached. Resets at midnight UTC.</p>
      )}
    </div>
  );
};

export default TokenBudgetDisplay;
