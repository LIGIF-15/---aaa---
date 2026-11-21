import React from 'react';
import { Upload } from 'lucide-react';

export type ActiveTab = 'inventory' | 'scan' | 'profile' | 'meals';

interface TopBarProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  verificationCount: number;
  expiringCount: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onNavigate,
  verificationCount,
  expiringCount,
}) => {
  const navItems: { id: ActiveTab; label: string; badgeText?: string }[] = [
    {
      id: 'inventory',
      label: 'Pantry',
      badgeText:
        expiringCount + verificationCount > 0
          ? String(expiringCount + verificationCount)
          : undefined,
    },
    { id: 'scan', label: 'Upload Photos' },
    { id: 'profile', label: 'Family Profile' },
    { id: 'meals', label: 'Meal Planner' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onNavigate('inventory')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-emerald-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          Hearthstock
        </button>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 ${
                  isActive
                    ? 'text-emerald-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{item.label}</span>
                {item.badgeText && (
                  <span className="ml-1.5 font-mono text-xs tabular-nums text-amber-700">
                    ({item.badgeText})
                  </span>
                )}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[13px] h-0.5 bg-emerald-700"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('scan')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>Upload Ingredients</span>
          </button>
        </div>
      </div>

      {/* Mobile navigation row */}
      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden items-center justify-around border-t border-slate-100 px-2 py-1.5 bg-white"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`px-2.5 py-2 text-xs font-medium whitespace-nowrap shrink-0 rounded-md transition-colors ${
                isActive
                  ? 'text-emerald-800 bg-emerald-50'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
              {item.badgeText ? ` (${item.badgeText})` : ''}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
