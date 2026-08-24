import { useState, useEffect } from 'react';

interface EnquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, email: string, message: string) => Promise<void>;
  initialName: string;
  initialMessage: string;
}

export default function EnquiryModal({
  isOpen,
  onClose,
  onSubmit,
  initialName,
  initialMessage,
}: EnquiryModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setMessage(initialMessage);
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, initialName, initialMessage]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please fill out Name, Email, and Message.');
      return;
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await onSubmit(name.trim(), email.trim(), message.trim());
      onClose();
    } catch (e) {
      setError('Failed to send. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[90] flex items-center justify-center pointer-events-auto px-4 transition-all duration-300">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-[#F2F2F7] dark:bg-zinc-900 w-full max-w-[320px] rounded-[2rem] shadow-2xl overflow-hidden relative z-10 border border-white/60 dark:border-zinc-700 p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-bold text-black dark:text-white tracking-tight">Contact Details</h2>
          <p className="text-[13px] text-gray-600 dark:text-gray-400 leading-snug mt-1.5">
            Please provide your details so we can reply directly to your enquiry.
          </p>
        </div>

        {error && (
          <p className="text-[#FF3B30] text-xs font-medium text-center">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white dark:bg-zinc-800 text-[15px] text-black dark:text-white rounded-xl px-4 py-3 border border-gray-300 dark:border-zinc-600 focus:outline-none focus:border-[#007AFF] shadow-sm transition-colors"
          />
          <input
            type="email"
            placeholder="Your Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white dark:bg-zinc-800 text-[15px] text-black dark:text-white rounded-xl px-4 py-3 border border-gray-300 dark:border-zinc-600 focus:outline-none focus:border-[#007AFF] shadow-sm transition-colors"
          />
          <textarea
            rows={3}
            placeholder="Your Enquiry..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full bg-white dark:bg-zinc-800 text-[15px] text-black dark:text-white rounded-xl px-4 py-3 border border-gray-300 dark:border-zinc-600 focus:outline-none focus:border-[#007AFF] resize-none shadow-sm transition-colors"
          />
        </div>

        <div className="flex gap-3 mt-1">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-xl font-semibold text-[15px] text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-zinc-800 active:scale-95 transition-transform shadow-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSubmitting}
            className="flex-1 py-3 rounded-xl font-semibold text-[15px] text-white bg-[#007AFF] active:scale-95 transition-transform shadow-sm cursor-pointer flex items-center justify-center disabled:opacity-50"
          >
            {isSubmitting ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
