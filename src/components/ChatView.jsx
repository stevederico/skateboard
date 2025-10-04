import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Card } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { useState, useEffect, useRef } from "react";
import { ArrowUp } from 'lucide-react';
import { getRemainingUsage, trackUsage, showCheckout, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '../context.jsx';

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
      }
    };

    updateUsage();
  }, [messages]);

  const handleSend = async () => {
    if (newMessage.trim()) {
      // Check usage limit from current state
      if (!usageInfo.isSubscriber && usageInfo.remaining <= 0) {
        showUpgradeSheet(upgradeSheetRef);
        return;
      }

      const userMessage = {
        id: Date.now(),
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
      setTimeout(() => {
        const aiResponse = {
          id: Date.now() + 1,
          text: "replace me with your favorite llm's response",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isMe: false
        };
        setMessages(prev => [...prev, aiResponse]);
        setIsTyping(false);
      }, 200);
    }
  };

  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex-1 px-4 lg:px-6 overflow-y-auto">
          {!isUserSubscriber && usageInfo.remaining >= 0 && (
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer rounded-full"
                onClick={() => showUpgradeSheet(upgradeSheetRef)}
              >
                {usageInfo.remaining} remaining
              </Button>
            </div>
          )}

          <div className="flex flex-col space-y-6 min-h-[500px]">
            {messages.map(msg => (
              <div key={msg.id} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
                <Card className={`max-w-sm p-3 ${
                  msg.isMe
                    ? 'bg-primary text-primary-foreground'
                    : ''
                }`}>
                  <p className="text-sm">{msg.text}</p>
                </Card>
                <p className="text-xs opacity-60 mt-1">{msg.time}</p>
              </div>
            ))}

            {isTyping && (
              <div className="flex flex-col items-start">
                <Card className="max-w-sm p-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-background px-4 lg:px-6 pb-4">
          <div className="flex gap-2">
            <Input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Message..."
              className="flex-1 rounded-full"
            />
            <Button
              onClick={handleSend}
              size="icon"
              className={`cursor-pointer h-12 w-12 rounded-full ${
                newMessage.trim()
                  ? ''
                  : 'bg-accent text-foreground hover:bg-accent/80'
              }`}
            >
              <ArrowUp size={20} />
            </Button>
          </div>
        </div>
      </div>

      <UpgradeSheet
        ref={upgradeSheetRef}
        userEmail={state.user?.email}
      />
    </div>
  )
}