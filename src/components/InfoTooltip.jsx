import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * InfoTooltip — Shows a small (?) icon that reveals a description on hover/tap.
 * Used for explaining KPIs, metrics, and fields to users.
 * 
 * Props:
 * - text: string — the explanation
 * - position: 'top' | 'bottom' | 'left' | 'right' (default: 'top')
 */
export default function InfoTooltip({ text, position = 'top' }) {
  const [show, setShow] = useState(false);

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}
    >
      <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-primary-500 cursor-help transition-colors" />
      {show && (
        <span className={`absolute z-50 ${positions[position]} w-56 px-3 py-2.5 bg-gray-900 text-white text-xs rounded-lg shadow-xl leading-relaxed pointer-events-none animate-fade-in`}>
          {text}
          <span className={`absolute w-2 h-2 bg-gray-900 rotate-45 ${
            position === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
            position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
            position === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
            'right-full top-1/2 -translate-y-1/2 -mr-1'
          }`} />
        </span>
      )}
    </span>
  );
}
