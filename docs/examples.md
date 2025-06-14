# Examples

Real-world examples and code snippets to help you build with Skateboard.

## Complete App Examples

### Todo App

A simple todo application using Skateboard components.

```jsx
// src/components/TodoApp.jsx
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Trash2, Plus, Check } from '@stevederico/skateboard-ui/lucide-react';

export function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');

  const addTodo = () => {
    if (newTodo.trim()) {
      setTodos([...todos, {
        id: Date.now(),
        text: newTodo,
        completed: false
      }]);
      setNewTodo('');
    }
  };

  const toggleTodo = (id) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Todo List</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              placeholder="Add a new todo..."
              onKeyPress={(e) => e.key === 'Enter' && addTodo()}
            />
            <Button onClick={addTodo} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-2">
            {todos.map(todo => (
              <div key={todo.id} className="flex items-center gap-2 p-2 border rounded">
                <Button
                  variant={todo.completed ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleTodo(todo.id)}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <span className={`flex-1 ${todo.completed ? 'line-through text-muted-foreground' : ''}`}>
                  {todo.text}
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteTodo(todo.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### E-commerce Product Card

Product card with Stripe integration.

```jsx
// src/components/ProductCard.jsx
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { ShoppingCart, Heart } from '@stevederico/skateboard-ui/lucide-react';

export function ProductCard({ product }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);

  const handlePurchase = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          priceId: product.priceId,
          mode: 'payment',
          successUrl: `${window.location.origin}/success`,
          cancelUrl: `${window.location.origin}/cancel`
        })
      });

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Purchase failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="p-0">
        <div className="relative">
          <img 
            src={product.image} 
            alt={product.name}
            className="w-full h-48 object-cover rounded-t-lg"
          />
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 bg-white/80 hover:bg-white"
            onClick={() => setIsFavorited(!isFavorited)}
          >
            <Heart 
              className={`h-4 w-4 ${isFavorited ? 'fill-red-500 text-red-500' : ''}`} 
            />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        <CardTitle className="text-lg mb-2">{product.name}</CardTitle>
        <p className="text-muted-foreground text-sm mb-4">{product.description}</p>
        
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold">${product.price}</span>
          <Button 
            onClick={handlePurchase}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <ShoppingCart className="h-4 w-4" />
            {isLoading ? 'Processing...' : 'Buy Now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Usage
const products = [
  {
    id: 1,
    name: "Premium Widget",
    description: "A high-quality widget for all your needs",
    price: 29.99,
    priceId: "price_1234567890",
    image: "https://example.com/widget.jpg"
  }
];

function ProductGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

### Dashboard with Charts

Analytics dashboard using Chart.js.

```jsx
// src/components/Dashboard.jsx
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Skeleton } from '@stevederico/skateboard-ui/shadcn/ui/skeleton';
import { TrendingUp, Users, DollarSign, ShoppingCart } from '@stevederico/skateboard-ui/lucide-react';

export function Dashboard() {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-6">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Revenue",
      value: `$${stats?.revenue?.toLocaleString() || 0}`,
      icon: DollarSign,
      trend: "+12.5%"
    },
    {
      title: "Total Users",
      value: stats?.users?.toLocaleString() || 0,
      icon: Users,
      trend: "+8.2%"
    },
    {
      title: "Orders",
      value: stats?.orders?.toLocaleString() || 0,
      icon: ShoppingCart,
      trend: "+15.3%"
    },
    {
      title: "Growth Rate",
      value: "24.5%",
      icon: TrendingUp,
      trend: "+2.1%"
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-green-600">{stat.trend}</span> from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.recentActivity?.map((activity, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{activity.title}</p>
                    <p className="text-sm text-muted-foreground">{activity.description}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats?.topProducts?.map((product, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{product.sales} sales</p>
                    </div>
                  </div>
                  <span className="font-medium">${product.revenue}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

## Form Examples

### Contact Form

```jsx
// src/components/ContactForm.jsx
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { Textarea } from '@stevederico/skateboard-ui/shadcn/ui/textarea';
import { Send } from '@stevederico/skateboard-ui/lucide-react';

export function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setSubmitted(true);
        setFormData({ name: '', email: '', subject: '', message: '' });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="text-center p-6">
          <div className="text-green-600 mb-4">
            <Send className="h-12 w-12 mx-auto" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Message Sent!</h3>
          <p className="text-muted-foreground">
            Thank you for your message. We'll get back to you soon.
          </p>
          <Button 
            className="mt-4" 
            onClick={() => setSubmitted(false)}
          >
            Send Another Message
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Contact Us</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              rows={4}
              required
            />
          </div>

          <Button 
            type="submit" 
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Sending...' : 'Send Message'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

### Multi-step Form

```jsx
// src/components/MultiStepForm.jsx
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@stevederico/skateboard-ui/shadcn/ui/card';
import { Button } from '@stevederico/skateboard-ui/shadcn/ui/button';
import { Input } from '@stevederico/skateboard-ui/shadcn/ui/input';
import { Label } from '@stevederico/skateboard-ui/shadcn/ui/label';
import { ChevronLeft, ChevronRight, Check } from '@stevederico/skateboard-ui/lucide-react';

export function MultiStepForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1
    firstName: '',
    lastName: '',
    email: '',
    // Step 2
    company: '',
    position: '',
    // Step 3
    plan: 'basic'
  });

  const totalSteps = 3;

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        console.log('Signup successful!');
      }
    } catch (error) {
      console.error('Signup failed:', error);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                name="company"
                value={formData.company}
                onChange={handleChange}
              />
            </div>
            <div>
              <Label htmlFor="position">Position</Label>
              <Input
                id="position"
                name="position"
                value={formData.position}
                onChange={handleChange}
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Label>Choose a plan</Label>
            <div className="space-y-2">
              {[
                { id: 'basic', name: 'Basic', price: '$9/month' },
                { id: 'pro', name: 'Pro', price: '$19/month' },
                { id: 'enterprise', name: 'Enterprise', price: '$49/month' }
              ].map(plan => (
                <label key={plan.id} className="flex items-center space-x-3 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                  <input
                    type="radio"
                    name="plan"
                    value={plan.id}
                    checked={formData.plan === plan.id}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 ${formData.plan === plan.id ? 'bg-primary border-primary' : 'border-gray-300'}`} />
                  <div className="flex-1">
                    <div className="font-medium">{plan.name}</div>
                    <div className="text-sm text-muted-foreground">{plan.price}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Sign Up</CardTitle>
        <div className="flex space-x-2">
          {[1, 2, 3].map(step => (
            <div
              key={step}
              className={`flex-1 h-2 rounded ${
                step <= currentStep ? 'bg-primary' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Step {currentStep} of {totalSteps}
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {renderStep()}

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          {currentStep === totalSteps ? (
            <Button onClick={handleSubmit}>
              <Check className="h-4 w-4 mr-2" />
              Complete
            </Button>
          ) : (
            <Button onClick={nextStep}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

## API Integration Examples

### Custom Hook for API Calls

```jsx
// src/hooks/useApi.js
import { useState, useEffect } from 'react';

export function useApi(url, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
            ...options.headers,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]);

  return { data, loading, error };
}

// Usage
function UserProfile() {
  const { data: user, loading, error } = useApi('/api/users/profile');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Welcome, {user?.name}!</h1>
      <p>Email: {user?.email}</p>
    </div>
  );
}
```

These examples show real-world usage patterns and can be copied directly into your Skateboard project. Each example demonstrates different aspects of building modern web applications with React and the Skateboard component library.
