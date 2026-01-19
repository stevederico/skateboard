import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import { useState, useEffect, useRef } from "react";
import { getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '@stevederico/skateboard-ui/Context';

/**
 * Chat view component with usage tracking and typing indicator
 *
 * Demo chat interface with:
 * - Usage tracking per message sent
 * - Upgrade prompts for non-subscribers at usage limit
 * - Typing indicator animation
 * - Auto-response after 200ms (placeholder for LLM API)
 * - Real-time usage counter in header
 *
 * State Management:
 * - messages: Array of { id, text, time, isMe }
 * - usageInfo: { remaining, isSubscriber } from getRemainingUsage
 * - newMessage: Input field state
 * - isTyping: Boolean for typing animation
 * - isLoading: Boolean to prevent sends during usage check
 *
 * @component
 * @returns {JSX.Element} Chat view with message interface
 */
export default function ChatView() {
  const { state } = getState();
  const [messages, setMessages] = useState([
    { id: 1, text: "Hey there! 👋", time: "2:30 PM", isMe: false },
    { id: 2, text: "Hi! How's it going?", time: "2:31 PM", isMe: true },
    { id: 3, text: "Good! Working on the new features", time: "2:32 PM", isMe: false },
    { id: 4, text: "Awesome, can't wait to see them!", time: "2:33 PM", isMe: true }
  ]);

  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [usageInfo, setUsageInfo] = useState({ remaining: -1, isSubscriber: true });
  const [isLoading, setIsLoading] = useState(true);
  const isUserSubscriber = usageInfo.isSubscriber
  const upgradeSheetRef = useRef();

  // Update usage info when messages change
  useEffect(() => {
    const updateUsage = async () => {
      try {
        const usage = await getRemainingUsage('messages');
        setUsageInfo(usage);
      } catch (error) {
        console.error('Error updating usage:', error);
      } finally {
        setIsLoading(false);
      }
    };

    updateUsage();
  }, [messages]);

  /**
   * Handle send message with usage tracking
   *
   * Prevents sending if loading or usage limit reached. Adds user message,
   * tracks usage, shows typing indicator, and simulates AI response after 200ms.
   * Replace setTimeout with actual LLM API call.
   *
   * @async
   */
  const handleSend = async () => {
    if (isLoading) return;

    if (newMessage.trim()) {
      // Check usage limit from current state
      if (!usageInfo.isSubscriber && usageInfo.remaining <= 0) {
        showUpgradeSheet(upgradeSheetRef);
        return;
      }

      const userMessage = {
        id: crypto.randomUUID(),
        text: newMessage,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isMe: true
      };

      setMessages(prev => [...prev, userMessage]);
      setNewMessage("");
      setIsTyping(true);

      // Track usage and update state with response
      const updatedUsage = await trackUsage('messages');
      setUsageInfo(updatedUsage);

      // Auto-response after 200ms
      // TODO: Replace with actual LLM API call
      setTimeout(() => {
        const aiResponse = {
          id: crypto.randomUUID(),
          text: "This is a demo response. Connect your LLM API here.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isMe: false
        };
        setMessages(prev => [...prev, aiResponse]);
        setIsTyping(false);
      }, 200);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <Header
        title="Chat"
        buttonTitle={!isUserSubscriber && usageInfo.remaining >= 0 ? `${usageInfo.remaining}` : undefined}
        buttonClass={!isUserSubscriber && usageInfo.remaining >= 0 ? "rounded-full w-10 h-10 flex items-center justify-center text-lg" : ""}
        onButtonTitleClick={!isUserSubscriber ? () => showUpgradeSheet(upgradeSheetRef) : undefined}
      />
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map(msg => (
          <div key={msg.id} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-sm px-4 py-3 rounded-lg ${
              msg.isMe 
                ? 'bg-app text-white' 
                : 'bg-accent'
            }`}>
              <p className="text-sm">{msg.text}</p>
            </div>
            <p className="text-xs opacity-60 mt-1">{msg.time}</p>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex flex-col items-start">
            <div className="max-w-sm px-4 py-3 rounded-lg bg-accent">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 pb-20 md:pb-6 border-t bg-background">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Message..."
            className="flex-1 px-4 py-3 bg-accent rounded-full outline-none"
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              newMessage.trim() && !isLoading
                ? 'bg-app text-white'
                : 'bg-accent text-foreground opacity-50'
            }`}
          >
            <DynamicIcon name="arrow-up" size={20} />
          </button>
        </div>
      </div>
      
      <UpgradeSheet 
        ref={upgradeSheetRef}
        userEmail={state.user?.email}
      />
    </div>
  )
}