import UpgradeSheet from './UpgradeSheet';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Avatar, AvatarFallback } from '@stevederico/skateboard-ui/shadcn/ui/avatar';
import { useState, useEffect, useRef } from "react";
import { ArrowUp, Sparkles } from 'lucide-react';
import { getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '../context.jsx';
import constants from '../constants.json';

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
  const isUserSubscriber = usageInfo.isSubscriber;
  const upgradeSheetRef = useRef();
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

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

  const getInitials = () => {
    if (state.user?.name) {
      return state.user.name.split(' ').map(word => word[0]).join('').toUpperCase();
    }
    return state.user?.email?.substring(0, 2).toUpperCase() || 'U';
  };

  // Pass usage info to SiteHeader
  useEffect(() => {
    if (window.updateChatUsageInfo) {
      window.updateChatUsageInfo(usageInfo, () => showUpgradeSheet(upgradeSheetRef));
    }

    // Cleanup: clear usage info when component unmounts
    return () => {
      if (window.updateChatUsageInfo) {
        window.updateChatUsageInfo(null, null);
      }
    };
  }, [usageInfo]);

  return (
    <div className="@container/main flex flex-1 flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto py-6 px-4">
        <div className="space-y-6">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 items-start ${msg.isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                <AvatarFallback className={msg.isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'}>
                  {msg.isMe ? getInitials() : <Sparkles className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'} flex-1 max-w-[85%]`}>
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.isMe
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3 items-start">
              <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                <AvatarFallback className="bg-muted">
                  <Sparkles className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start">
                <div className="rounded-2xl px-4 py-3 bg-muted">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t bg-background">
        <div className="py-4 px-4">
          <div className="relative flex items-center gap-2">
            <Input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Message..."
              className="flex-1 rounded-3xl pr-12 h-12 text-base resize-none"
            />
            <Button
              onClick={handleSend}
              size="icon"
              disabled={!newMessage.trim()}
              className={`cursor-pointer h-10 w-10 rounded-full absolute right-1 ${
                newMessage.trim()
                  ? ''
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <ArrowUp size={20} />
            </Button>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-2">
            {constants.appName} can make mistakes. Check important info.
          </p>
        </div>
      </div>

      <UpgradeSheet
        ref={upgradeSheetRef}
        userEmail={state.user?.email}
      />
    </div>
  )
}