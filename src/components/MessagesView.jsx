import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import { useState, useEffect, useRef } from "react";
import { ArrowUp } from 'lucide-react';
import { getRemainingUsage, trackUsage, showCheckout } from '@stevederico/skateboard-ui/Utilities';
import { getState } from '../context.jsx';

export default function MessagesView() {
  const { state } = getState();
  const [messages, setMessages] = useState([
    { id: 1, text: "Hey there! 👋", time: "2:30 PM", isMe: false },
    { id: 2, text: "Hi! How's it going?", time: "2:31 PM", isMe: true },
    { id: 3, text: "Good! Working on the new features", time: "2:32 PM", isMe: false },
    { id: 4, text: "Awesome, can't wait to see them!", time: "2:33 PM", isMe: true }
  ]);

  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [usageInfo, setUsageInfo] = useState({ remaining: -1, unlimited: true });
  const upgradeSheetRef = useRef();

  useEffect(() => {
    const updateUsage = async () => {
      const usage = await getRemainingUsage('messages');
      setUsageInfo(usage);
    };
    updateUsage();
  }, [messages]);

  const handleSend = async () => {
    if (newMessage.trim()) {
      // Check usage limit
      const usage = await getRemainingUsage('messages');
      if (!usage.unlimited && usage.remaining <= 0) {
        upgradeSheetRef.current?.show();
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
      
      // Track usage
      trackUsage('messages');
      
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
    <div className="flex flex-col h-screen">
      <Header 
        title="Messages" 
        buttonTitle={!usageInfo.unlimited ? `${usageInfo.remaining}` : undefined}
        buttonClass="rounded-full w-10 h-10 flex items-center justify-center text-lg"
        onButtonTitleClick={() => showCheckout(state.user?.email)}
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
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              newMessage.trim() 
                ? 'bg-app text-white' 
                : 'bg-accent text-foreground'
            }`}
          >
            <ArrowUp size={20} />
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