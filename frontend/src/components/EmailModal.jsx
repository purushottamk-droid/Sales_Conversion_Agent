import { useState } from 'react';

export default function EmailModal({ open, onClose, onSend }) {
  const [email, setEmail] = useState('');

  const handleSend = () => {
    if (!email.trim()) return;
    onSend(email.trim());
    setEmail('');
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={`fixed inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center z-200 transition-opacity duration-250 ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        className={`bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl p-[26px] w-[380px] max-w-[90vw] shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)] transition-transform duration-250 ${
          open ? 'translate-y-0' : 'translate-y-[10px]'
        }`}
      >
        <h3 className="text-base font-semibold mb-1.5">Email this report</h3>
        <p className="text-[12.8px] text-[#55698c] dark:text-[#8ca0c2] leading-normal mb-4">
          We'll open your email client with the report summary pre-filled, ready for you to send.
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="manager@company.com"
          className="w-full px-3.5 py-2.5 rounded-[10px] border border-brand-200 dark:border-ink-500 bg-brand-50 dark:bg-ink-600 text-[#10233f] dark:text-slate-100 text-[13.5px] outline-none mb-4"
        />
        <div className="flex gap-2.5 justify-end">
          <button
            onClick={onClose}
            className="bg-transparent border border-brand-200 dark:border-ink-500 text-[#55698c] dark:text-[#8ca0c2] px-4 py-2.5 rounded-[10px] text-[13.5px] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            className="bg-gradient-to-br from-brand-500 to-brand-400 text-white border-none px-[18px] py-2.5 rounded-[10px] text-[13.5px] font-semibold cursor-pointer shadow-[0_8px_22px_-6px_rgba(46,111,224,0.4)]"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
