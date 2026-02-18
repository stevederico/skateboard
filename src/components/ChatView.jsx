import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import DynamicIcon from '@stevederico/skateboard-ui/DynamicIcon';
import { useState, useEffect, useRef, useCallback } from "react";
import { getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '@stevederico/skateboard-ui/Context';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card, CardContent } from '@stevederico/skateboard-ui/shadcn/ui/card';

/**
 * Chat view component with usage tracking and typing indicator
 *
 * Demo chat interface with:
 * - Usage tracking per message sent
 * - Upgrade prompts for non-subscribers at usage limit
 * - Typing indicator animation
 * - Auto-response after 200ms (placeholder for LLM API)
 * - Real-time usage counter in header
 * - Auto-scroll to latest message
 *
 * @component
 * @returns {JSX.Element} Chat view with message interface
 */
export default function ChatView() {
  const { state, dispatch } = getState();
  const requireAuth = useCallback((callback) => {
    if (state.user) {
      callback();
    } else {
      dispatch({ type: 'SHOW_AUTH_OVERLAY', payload: callback });
    }
  }, [state.user, dispatch]);
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
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    getRemainingUsage('messages')
      .then(setUsageInfo)
      .catch((error) => console.error('Error fetching usage:', error))
      .finally(() => setIsLoading(false));
  }, []);

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
    <div className="flex flex-col flex-1 h-full">
      <Header
        title="Chat"
        buttonTitle={!isUserSubscriber && usageInfo.remaining >= 0 ? `${usageInfo.remaining}` : undefined}
        buttonClass={!isUserSubscriber && usageInfo.remaining >= 0 ? "rounded-full w-10 h-10 flex items-center justify-center text-lg" : ""}
        onButtonTitleClick={!isUserSubscriber ? () => showUpgradeSheet(upgradeSheetRef) : undefined}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-sm ${msg.isMe ? 'items-end' : 'items-start'} flex flex-col`}>
              <Card className={`py-0 gap-0 shadow-none ring-0 ${
                msg.isMe
                  ? 'bg-app text-white rounded-br-sm'
                  : 'bg-accent rounded-bl-sm'
              }`}>
                <CardContent className="px-4 py-2.5">
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                </CardContent>
              </Card>
              <span className="text-[11px] text-muted-foreground mt-1 px-1">{msg.time}</span>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <Card className="py-0 gap-0 shadow-none ring-0 bg-accent rounded-bl-sm">
              <CardContent className="px-4 py-2.5">
                <div className="flex space-x-1.5">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 pb-20 md:pb-4 border-t bg-background">
        <div className="flex gap-2">
          <Input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && requireAuth(() => handleSend())}
            placeholder="Message..."
            className="flex-1 h-10 rounded-full bg-accent border-0 px-4 focus-visible:ring-app"
          />
          <Button
            size="icon"
            onClick={() => requireAuth(() => handleSend())}
            disabled={isLoading}
            className={`rounded-full w-10 h-10 ${
              newMessage.trim() && !isLoading
                ? 'bg-app text-white hover:bg-app/80'
                : 'bg-accent text-foreground opacity-50'
            }`}
          >
            <DynamicIcon name="arrow-up" size={18} />
          </Button>
        </div>
      </div>

      <UpgradeSheet
        ref={upgradeSheetRef}
        userEmail={state.user?.email}
      />
    </div>
  )
}
