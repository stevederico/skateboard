# Stripe Integration

Skateboard includes built-in Stripe integration for handling payments, subscriptions, and checkout flows.

## Setup

### 1. Stripe Account

1. Create a [Stripe account](https://stripe.com)
2. Get your API keys from the Stripe Dashboard
3. Install Stripe CLI for local testing (optional)

### 2. Configuration

#### Frontend Configuration

Add your Stripe publishable key to `src/constants.json`:

```json
{
  "stripePublishableKey": "pk_test_..."
}
```

Or use environment variables in `.env`:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

#### Backend Configuration

Add your Stripe secret key to `backend/.env`:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Components

### StripeView

The main component for handling Stripe payments:

```jsx
import { StripeView } from '@stevederico/skateboard-ui';

<StripeView />
```

This component handles:
- Payment form UI
- Stripe Elements integration
- Payment processing
- Success/error states

## Backend API

### Payment Endpoints

#### POST /api/stripe/create-payment-intent

Create a payment intent for one-time payments.

**Request:**
```json
{
  "amount": 2000,           // Amount in cents ($20.00)
  "currency": "usd",
  "description": "Product purchase"
}
```

**Response:**
```json
{
  "clientSecret": "pi_1234_secret_5678",
  "paymentIntentId": "pi_1234567890"
}
```

#### POST /api/stripe/create-checkout-session

Create a Stripe Checkout session.

**Request:**
```json
{
  "priceId": "price_1234567890",
  "mode": "payment",        // or "subscription"
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel"
}
```

**Response:**
```json
{
  "sessionId": "cs_1234567890",
  "url": "https://checkout.stripe.com/pay/cs_1234567890"
}
```

#### POST /api/stripe/webhook

Handle Stripe webhooks for payment confirmations.

**Headers:**
```
stripe-signature: webhook-signature-here
```

### Subscription Endpoints

#### POST /api/stripe/create-subscription

Create a new subscription.

**Request:**
```json
{
  "customerId": "cus_1234567890",
  "priceId": "price_1234567890"
}
```

#### GET /api/stripe/subscriptions/:customerId

Get customer subscriptions.

#### POST /api/stripe/cancel-subscription

Cancel a subscription.

**Request:**
```json
{
  "subscriptionId": "sub_1234567890"
}
```

## Frontend Integration

### Payment Form

```jsx
import { useState } from 'react';
import { StripeView } from '@stevederico/skateboard-ui';

function PaymentPage() {
  const [amount, setAmount] = useState(2000); // $20.00
  
  const handlePaymentSuccess = (paymentIntent) => {
    console.log('Payment successful:', paymentIntent);
    // Redirect or show success message
  };
  
  const handlePaymentError = (error) => {
    console.error('Payment failed:', error);
    // Show error message
  };
  
  return (
    <StripeView 
      amount={amount}
      onSuccess={handlePaymentSuccess}
      onError={handlePaymentError}
    />
  );
}
```

### Checkout Redirect

```jsx
import { loadStripe } from '@stripe/stripe-js';

const stripe = await loadStripe(process.env.VITE_STRIPE_PUBLISHABLE_KEY);

async function redirectToCheckout(priceId) {
  const response = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      priceId,
      mode: 'payment',
      successUrl: `${window.location.origin}/success`,
      cancelUrl: `${window.location.origin}/cancel`,
    }),
  });
  
  const { sessionId } = await response.json();
  
  const { error } = await stripe.redirectToCheckout({
    sessionId,
  });
  
  if (error) {
    console.error('Checkout error:', error);
  }
}
```

## Webhook Handling

### Setup Webhooks

1. In Stripe Dashboard, go to Webhooks
2. Add endpoint: `https://yourapp.com/api/stripe/webhook`
3. Select events to listen for:
   - `payment_intent.succeeded`
   - `invoice.payment_succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

### Webhook Handler

```javascript
// backend/server.js
app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('Payment succeeded:', paymentIntent.id);
      // Update database, send confirmation email, etc.
      break;
      
    case 'customer.subscription.created':
      const subscription = event.data.object;
      console.log('Subscription created:', subscription.id);
      // Update user's subscription status
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});
```

## Product Configuration

### Create Products in Stripe

1. Go to Stripe Dashboard > Products
2. Create your products and prices
3. Note the price IDs for your frontend

### Pricing Table

```jsx
const pricingPlans = [
  {
    id: 'price_basic',
    name: 'Basic',
    price: '$9/month',
    features: ['Feature 1', 'Feature 2']
  },
  {
    id: 'price_pro',
    name: 'Pro', 
    price: '$19/month',
    features: ['All Basic features', 'Feature 3', 'Feature 4']
  }
];

function PricingTable() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {pricingPlans.map(plan => (
        <div key={plan.id} className="border rounded-lg p-6">
          <h3 className="text-xl font-bold">{plan.name}</h3>
          <p className="text-2xl font-bold text-primary">{plan.price}</p>
          <ul className="mt-4 space-y-2">
            {plan.features.map(feature => (
              <li key={feature}>✓ {feature}</li>
            ))}
          </ul>
          <button 
            onClick={() => redirectToCheckout(plan.id)}
            className="w-full mt-6 bg-primary text-white py-2 rounded"
          >
            Subscribe
          </button>
        </div>
      ))}
    </div>
  );
}
```

## Testing

### Test Cards

Use Stripe's test card numbers:

- **Success**: `4242424242424242`
- **Decline**: `4000000000000002`
- **3D Secure**: `4000002500003155`

### Local Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

## Security Best Practices

1. **Never expose secret keys** in frontend code
2. **Validate webhooks** using Stripe signatures
3. **Use HTTPS** in production
4. **Verify payments** server-side before fulfilling orders
5. **Handle errors** gracefully and securely

## Common Issues

### CORS Errors
Ensure your backend allows requests from your frontend domain.

### Webhook Failures
- Check webhook signature verification
- Ensure webhook endpoint is accessible
- Verify webhook secret is correct

### Payment Failures
- Check Stripe Dashboard for detailed error logs
- Verify API keys are correct for your environment
- Test with Stripe's test card numbers
