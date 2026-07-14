// src/components/ChatWidget.jsx
//
// Floating chat widget, bottom-right. Only meant to be mounted once the
// pipeline has completed (App.jsx gates this), since every message needs
// the session_id created during that run.
//
// Voice input: browser's native Web Speech API (SpeechRecognition) for
// live transcription — dummy/demo-grade: Chrome and Edge only, no backend
// STT involved. Interim (in-progress) results are shown live above the
// input as the user talks; the final transcript is appended into the
// input once the browser finalizes that phrase.
//
// Voice output: browser's native SpeechSynthesis API reads each assistant
// reply aloud automatically as it arrives (toggle via the header mute
// button). Each assistant bubble also has a replay button.
//
// Reply formatting: **markdown bold** and "quoted phrases" in a reply are
// rendered bold, and the reply is split into paragraphs on blank lines /
// "* " bullet markers for readability instead of one dense wall of text.

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic as MicLauncher, X, Send, Mic, MicOff, Loader2, Volume2, VolumeX } from 'lucide-react';
import { sendChatMessage } from '../api/pipelineClient';

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

const speechSynthesisAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Renders **markdown bold** and "double-quoted" phrases as bold spans,
// and breaks the text into paragraphs so replies don't render as one
// dense block. A "* **Heading**" bullet marker starts a new paragraph,
// with the bolded phrase acting as a bold lead-in before the normal
// prose that follows it.
function renderInlineBold(str, keyPrefix) {
  // Split on **bold** markers first, then quoted phrases within the
  // remaining plain segments.
  const boldParts = str.split(/(\*\*[^*]+\*\*)/g);

  return boldParts.map((part, i) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return (
        <b key={`${keyPrefix}-b-${i}`} className="font-semibold text-[#10233f] dark:text-slate-100">
          {boldMatch[1]}
        </b>
      );
    }

    const quoteParts = part.split(/("(?:[^"]+)")/g);
    return quoteParts.map((qp, j) =>
      qp.startsWith('"') && qp.endsWith('"') ? (
        <b key={`${keyPrefix}-q-${i}-${j}`} className="font-semibold text-[#10233f] dark:text-slate-100">
          {qp}
        </b>
      ) : (
        <span key={`${keyPrefix}-s-${i}-${j}`}>{qp}</span>
      )
    );
  });
}

function FormattedReply({ text }) {
  // Force a paragraph break before every "* " bullet marker (whether or
  // not the source already put it on its own line), so each bolded item
  // starts its own paragraph instead of running into the previous one.
  const withBreaks = text.replace(/\s*\*\s+(?=\*\*)/g, '\n\n');

  const paragraphs = withBreaks
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-2 last:mb-0">
          {renderInlineBold(p, i)}
        </p>
      ))}
    </>
  );
}

export default function ChatWidget({ sessionId, userId = 'test_user' }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', text: string }
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const baseInputRef = useRef(''); // input text before the current speech segment started

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript]);

  // Set up SpeechRecognition once, if the browser supports it.
  useEffect(() => {
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        baseInputRef.current = `${baseInputRef.current}${final} `;
        setInput(baseInputRef.current);
        setInterimTranscript('');
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event) => {
      setError(`Mic error: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, []);

  // Stop any speech playback on unmount.
  useEffect(() => {
    return () => {
      if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    };
  }, []);

  // Strips markdown bold markers, bullet asterisks, and quote characters
// before handing text to the speech synthesizer, so it's read as clean
// prose instead of literally saying "asterisk asterisk".
  function stripMarkdownForSpeech(text) {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** -> bold
      .replace(/^\s*\*\s+/gm, '')        // leading "* " bullet markers
      .replace(/\*/g, '')                // any stray asterisks left over
      .replace(/"/g, '');                // quote characters
  }

  const speak = useCallback(
    (text) => {
      if (!speechSynthesisAvailable || muted || !text) return;
      window.speechSynthesis.cancel(); // don't overlap replies
      const utterance = new SpeechSynthesisUtterance(stripMarkdownForSpeech(text));
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    },
    [muted]
  );

  const toggleListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (listening) {
      recognition.stop();
      setListening(false);
    } else {
      setError(null);
      baseInputRef.current = input ? `${input} ` : '';
      recognition.start();
      setListening(true);
    }
  }, [listening, input]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || !sessionId) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    }

    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    baseInputRef.current = '';
    setInterimTranscript('');
    setSending(true);
    setError(null);

    try {
      const res = await sendChatMessage({ userId, sessionId, message: text });
      const replyText =
        res?.reply ?? res?.message ?? res?.text ?? (typeof res === 'string' ? res : JSON.stringify(res));
      setMessages((m) => [...m, { role: 'assistant', text: replyText }]);
      speak(replyText);
    } catch (err) {
      console.error('Chat message failed:', err);
      const errText = `⚠️ ${err.message || 'Failed to get a reply.'}`;
      setMessages((m) => [...m, { role: 'assistant', text: errText }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, sessionId, userId, listening, speak]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating launcher button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-200 w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-brand-400 text-white shadow-[0_10px_30px_-8px_rgba(46,111,224,0.5)] flex items-center justify-center cursor-pointer transition-transform hover:-translate-y-0.5"
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? <X className="w-6 h-6" strokeWidth={2} /> : <MicLauncher className="w-6 h-6" strokeWidth={2} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-200 w-[360px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-8rem)] bg-white dark:bg-ink-700 border border-brand-200 dark:border-ink-500 rounded-2xl shadow-[0_20px_50px_-12px_rgba(30,70,140,0.3)] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-brand-200 dark:border-ink-500 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center shrink-0">
              <MicLauncher className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold truncate">Ask about this rep</div>
              <div className="text-[11px] text-slate-400 dark:text-ink-400 truncate">
                Follow-up Q&A on the analysis
              </div>
            </div>
            {speechSynthesisAvailable && (
              <button
                onClick={() => {
                  if (!muted) window.speechSynthesis.cancel();
                  setMuted((m) => !m);
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-ink-400 hover:text-brand-500 cursor-pointer shrink-0"
                aria-label={muted ? 'Unmute replies' : 'Mute replies'}
                title={muted ? 'Unmute replies' : 'Mute replies'}
              >
                {muted ? <VolumeX className="w-4 h-4" strokeWidth={2} /> : <Volume2 className="w-4 h-4" strokeWidth={2} />}
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3.5 flex flex-col gap-2.5">
            {messages.length === 0 && (
              <div className="text-[12.5px] text-slate-400 dark:text-ink-400 text-center mt-8">
                Ask something like "How can we improve the Terra Holdings deal?"
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] text-[13px] leading-relaxed px-3 py-2 rounded-xl ${
                  m.role === 'user'
                    ? 'self-end bg-gradient-to-br from-brand-500 to-brand-400 text-white'
                    : 'self-start bg-brand-500/5 dark:bg-ink-600 text-[#10233f] dark:text-slate-100'
                }`}
              >
                {m.role === 'assistant' ? (
                  <>
                    <FormattedReply text={m.text} />
                    {speechSynthesisAvailable && (
                      <button
                        onClick={() => speak(m.text)}
                        className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-brand-500 cursor-pointer"
                        aria-label="Replay this message"
                      >
                        <Volume2 className="w-3 h-3" strokeWidth={2} />
                        Replay
                      </button>
                    )}
                  </>
                ) : (
                  m.text
                )}
              </div>
            ))}
            {sending && (
              <div className="self-start flex items-center gap-1.5 text-[12px] text-slate-400 dark:text-ink-400 px-3 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking…
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && (
            <div className="px-4 py-1.5 text-[11.5px] text-rose-500 border-t border-brand-200 dark:border-ink-500">
              {error}
            </div>
          )}

          {/* Live transcript preview while mic is active */}
          {listening && interimTranscript && (
            <div className="px-4 py-1.5 text-[12px] text-brand-500 italic border-t border-brand-200 dark:border-ink-500">
              {interimTranscript}
            </div>
          )}

          {/* Input row */}
          <div className="p-3 border-t border-brand-200 dark:border-ink-500 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={listening ? 'Listening…' : 'Type or speak a message…'}
              rows={1}
              className="flex-1 resize-none border border-brand-200 dark:border-ink-500 rounded-xl px-3 py-2 text-[13px] bg-transparent outline-none focus:border-brand-500 placeholder:text-slate-400 dark:placeholder:text-ink-400 max-h-24"
            />
            <button
              onClick={toggleListening}
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                listening
                  ? 'bg-rose-500 text-white'
                  : 'bg-brand-100 dark:bg-ink-600 text-brand-500 hover:bg-brand-200 dark:hover:bg-ink-500'
              }`}
              aria-label={listening ? 'Stop voice input' : 'Start voice input'}
            >
              {listening ? <MicOff className="w-4 h-4" strokeWidth={2} /> : <Mic className="w-4 h-4" strokeWidth={2} />}
            </button>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 text-white flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-transform hover:-translate-y-px"
              aria-label="Send message"
            >
              <Send className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}