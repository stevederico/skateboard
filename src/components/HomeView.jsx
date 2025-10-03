import Header from '@stevederico/skateboard-ui/Header';
import UpgradeSheet from '@stevederico/skateboard-ui/UpgradeSheet';
import { useEffect, useState, useRef } from "react";
import { getBackendURL, getCookie, timestampToString, showCheckout, getRemainingUsage, trackUsage, showUpgradeSheet } from '@stevederico/skateboard-ui/Utilities';
import { Trash2, Check } from 'lucide-react';
import { getState } from '../context.jsx';
import constants from '../constants.json';

export default function HomeView() {
  const { state } = getState();
  const [usageInfo, setUsageInfo] = useState({ remaining: -1, unlimited: true });
  const isUserSubscriber = state.user?.subscription?.status === 'active' &&
    (!state.user?.subscription?.expires || state.user?.subscription?.expires > Math.floor(Date.now() / 1000))

  // Get app-specific localStorage key
  const getTodosKey = () => {
    const appName = constants.appName || 'skateboard';
    return `${appName.toLowerCase().replace(/\s+/g, '-')}_todos_v2`;
  };

  const [todos, setTodos] = useState(() => {
    const savedTodos = localStorage.getItem(getTodosKey());
    return savedTodos ? JSON.parse(savedTodos) : [
      { id: 1, text: 'Complete the weekly report', completed: false, createdAt: new Date() },
      { id: 2, text: 'Call the client about the project update', completed: false, createdAt: new Date() },
      { id: 3, text: 'Review the team proposals', completed: false, createdAt: new Date() }
    ];
  });
  const [newTodo, setNewTodo] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);
  const upgradeSheetRef = useRef();

  // Save todos to localStorage whenever todos change
  useEffect(() => {
    localStorage.setItem(getTodosKey(), JSON.stringify(todos));
  }, [todos]);

  // Subscriber status is now fetched once in main.jsx and stored in context

  // Update usage info when todos change
  useEffect(() => {
    const updateUsage = async () => {
      try {
        const usage = await getRemainingUsage('todos');
        setUsageInfo(usage);
      } catch (error) {
        console.error('Error updating usage:', error);
      }
    };

    updateUsage();
  }, [todos]);

  const addTodo = async () => {
    if (newTodo.trim()) {
      // Check usage limit
      const usage = await getRemainingUsage('todos');
      if (!usage.unlimited && usage.remaining <= 0) {
        showUpgradeSheet(upgradeSheetRef);
        return;
      }

      const todo = {
        id: Date.now(),
        text: newTodo.trim(),
        completed: false,
        createdAt: new Date()
      };
      setTodos([todo, ...todos]);
      setNewTodo('');
      
      // Track usage
      trackUsage('todos');
    }
  };

  const toggleTodo = (id) => {
    const updatedTodos = todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    
    // Sort todos: incomplete first, completed at bottom
    const sortedTodos = updatedTodos.sort((a, b) => {
      if (a.completed === b.completed) return 0;
      return a.completed ? 1 : -1;
    });
    
    setTodos(sortedTodos);
  };

  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      addTodo();
    }
  };

  const handleDragStart = (e, todo) => {
    setDraggedItem(todo);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, todo) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItem(todo.id);
  };

  const handleDrop = (e, targetTodo) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem.id === targetTodo.id) {
      setDragOverItem(null);
      return;
    }

    const draggedIndex = todos.findIndex(todo => todo.id === draggedItem.id);
    const targetIndex = todos.findIndex(todo => todo.id === targetTodo.id);
    
    const newTodos = [...todos];
    const [removed] = newTodos.splice(draggedIndex, 1);
    newTodos.splice(targetIndex, 0, removed);
    
    setTodos(newTodos);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const completedCount = todos.filter(todo => todo.completed).length;
  const totalCount = todos.length;

  return (
    <>
      <Header
        title="Home"
        buttonTitle={!isUserSubscriber ? (!usageInfo.unlimited ? `${usageInfo.remaining}` : "Get Unlimited") : undefined}
        buttonClass={!isUserSubscriber && !usageInfo.unlimited ? "rounded-full w-10 h-10 flex items-center justify-center text-lg" : ""}
        onButtonTitleClick={!isUserSubscriber ? () => {
          showUpgradeSheet(upgradeSheetRef);
        } : undefined}
      />

      <div className="flex flex-col h-screen bg-background">
        {/* Add New Todo */}
        <div className="p-4 border-b bg-background">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Add a new task"
            className="w-full px-4 py-3 bg-accent border-0 rounded-full focus:outline-none focus:ring-2 focus:ring-app"
          />
        </div>

        {/* Todo List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {todos.length === 0 ? (
            <div className="text-center py-8 opacity-60">
              <p>No tasks yet. Add one above to get started!</p>
            </div>
          ) : (
            todos.map((todo) => (
              <div
                key={todo.id}
                draggable
                onDragStart={(e) => handleDragStart(e, todo)}
                onDragOver={(e) => handleDragOver(e, todo)}
                onDrop={(e) => handleDrop(e, todo)}
                onDragEnd={handleDragEnd}
                className={`group flex items-center gap-3 p-6 bg-accent rounded transition-all hover:bg-accent/80 border-2 ${
                  todo.completed ? 'opacity-60' : ''
                } ${
                  draggedItem?.id === todo.id 
                    ? 'opacity-50 border-app shadow-lg scale-105' 
                    : dragOverItem === todo.id
                    ? 'border-app bg-accent/90'
                    : 'border-transparent'
                }`}
              >
                {/* Checkbox */}
                <div
                  onClick={() => toggleTodo(todo.id)}
                  className={`w-6 h-6 border-2 border-accent rounded cursor-pointer flex items-center justify-center bg-background`}
                >
                  {todo.completed && <Check size={14} className="text-foreground" />}
                </div>

                {/* Todo Text */}
                <span
                  className={`flex-1 ${
                    todo.completed
                      ? 'line-through opacity-60'
                      : ''
                  }`}
                >
                  {todo.text}
                </span>

                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTodo(todo.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all p-1 cursor-pointer"
                  title="Delete task"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      
      <UpgradeSheet 
        ref={upgradeSheetRef}
        userEmail={state.user?.email}
      />
    </>
  )
}
