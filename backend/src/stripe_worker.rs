//! Dedicated OS threads for blocking Stripe (libcurl) calls.
//!
//! HTTP workers must not sit inside a 30s Stripe round-trip — the pool has only
//! a handful of threads, and one slow checkout would stall health checks and
//! unrelated API traffic. Each job is handed to a Stripe-owned thread; the
//! request thread waits with a hard timeout and answers 504 if Stripe stalls.

use std::sync::mpsc::{self, Receiver, Sender, SyncSender, RecvTimeoutError};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use crate::json::Json;
use crate::stripe::{
    CheckoutParams, CheckoutSession, PortalSession, StripeClient, StripeError,
};

/// How long a request thread waits for a Stripe worker to finish one call.
pub const STRIPE_CALL_TIMEOUT: Duration = Duration::from_secs(10);

/// Handle that submits Stripe work to a background thread.
///
/// Clone-free and `Send`+`Sync`: the channel sender is behind a mutex so every
/// HTTP worker can enqueue without racing.
pub struct StripeWorker {
    tx: Mutex<Sender<Job>>,
}

/// Owned arguments for [`StripeClient::create_checkout_session`].
pub struct OwnedCheckoutParams {
    /// Customer email prefill.
    pub customer_email: String,
    /// Resolved Stripe price id.
    pub price_id: String,
    /// Success redirect URL.
    pub success_url: String,
    /// Cancel redirect URL.
    pub cancel_url: String,
    /// Optional app metadata stamp.
    pub app_name: Option<String>,
    /// Optional idempotency key.
    pub idempotency_key: Option<String>,
}

enum Job {
    PriceId {
        lookup_key: String,
        reply: SyncSender<Result<Option<String>, StripeError>>,
    },
    Checkout {
        params: OwnedCheckoutParams,
        reply: SyncSender<Result<CheckoutSession, StripeError>>,
    },
    Portal {
        customer: String,
        return_url: String,
        reply: SyncSender<Result<PortalSession, StripeError>>,
    },
    RetrieveSub {
        sub_id: String,
        reply: SyncSender<Result<Json, StripeError>>,
    },
    CustomerEmail {
        customer_id: String,
        reply: SyncSender<Result<Option<String>, StripeError>>,
    },
}

impl StripeWorker {
    /// Spawn one worker thread that owns `client` and drains the job queue.
    ///
    /// A single dedicated thread is enough: the goal is freeing HTTP workers
    /// during libcurl waits, not parallelising Stripe itself.
    pub fn spawn(client: StripeClient) -> Self {
        let (tx, rx) = mpsc::channel::<Job>();
        thread::Builder::new()
            .name("stripe-worker".into())
            .spawn(move || worker_loop(rx, client))
            .expect("failed to spawn stripe worker");
        StripeWorker {
            tx: Mutex::new(tx),
        }
    }

    /// Resolve a price lookup key on the worker thread.
    pub fn price_id_for_lookup_key(&self, lookup_key: &str) -> Result<Option<String>, StripeError> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.send(Job::PriceId {
            lookup_key: lookup_key.to_string(),
            reply: reply_tx,
        })?;
        wait(reply_rx)
    }

    /// Create a Checkout Session on the worker thread.
    pub fn create_checkout_session(
        &self,
        params: OwnedCheckoutParams,
    ) -> Result<CheckoutSession, StripeError> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.send(Job::Checkout {
            params,
            reply: reply_tx,
        })?;
        wait(reply_rx)
    }

    /// Create a Billing Portal Session on the worker thread.
    pub fn create_portal_session(
        &self,
        customer: &str,
        return_url: &str,
    ) -> Result<PortalSession, StripeError> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.send(Job::Portal {
            customer: customer.to_string(),
            return_url: return_url.to_string(),
            reply: reply_tx,
        })?;
        wait(reply_rx)
    }

    /// Fetch a subscription on the worker thread.
    pub fn retrieve_subscription(&self, sub_id: &str) -> Result<Json, StripeError> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.send(Job::RetrieveSub {
            sub_id: sub_id.to_string(),
            reply: reply_tx,
        })?;
        wait(reply_rx)
    }

    /// Fetch a customer email on the worker thread.
    pub fn customer_email(&self, customer_id: &str) -> Result<Option<String>, StripeError> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.send(Job::CustomerEmail {
            customer_id: customer_id.to_string(),
            reply: reply_tx,
        })?;
        wait(reply_rx)
    }

    fn send(&self, job: Job) -> Result<(), StripeError> {
        self.tx
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .send(job)
            .map_err(|_| StripeError::Transport("stripe worker queue closed".into()))
    }
}

fn wait<T>(rx: Receiver<Result<T, StripeError>>) -> Result<T, StripeError> {
    match rx.recv_timeout(STRIPE_CALL_TIMEOUT) {
        Ok(v) => v,
        Err(RecvTimeoutError::Timeout) => Err(StripeError::Timeout),
        Err(RecvTimeoutError::Disconnected) => {
            Err(StripeError::Transport("stripe worker died".into()))
        }
    }
}

fn worker_loop(rx: Receiver<Job>, client: StripeClient) {
    while let Ok(job) = rx.recv() {
        match job {
            Job::PriceId { lookup_key, reply } => {
                let _ = reply.send(client.price_id_for_lookup_key(&lookup_key));
            }
            Job::Checkout { params, reply } => {
                let result = client.create_checkout_session(CheckoutParams {
                    customer_email: &params.customer_email,
                    price_id: &params.price_id,
                    success_url: &params.success_url,
                    cancel_url: &params.cancel_url,
                    app_name: params.app_name.as_deref(),
                    idempotency_key: params.idempotency_key.as_deref(),
                });
                let _ = reply.send(result);
            }
            Job::Portal {
                customer,
                return_url,
                reply,
            } => {
                let _ = reply.send(client.create_portal_session(&customer, &return_url));
            }
            Job::RetrieveSub { sub_id, reply } => {
                let _ = reply.send(client.retrieve_subscription(&sub_id));
            }
            Job::CustomerEmail { customer_id, reply } => {
                let _ = reply.send(client.customer_email(&customer_id));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stripe::StripeMock;
    use std::time::Instant;

    #[test]
    fn worker_returns_mocked_price() {
        let mut mock = StripeMock::default();
        mock.prices.insert("premium_monthly".into(), "price_123".into());
        let worker = StripeWorker::spawn(StripeClient::with_mock(mock));
        assert_eq!(
            worker.price_id_for_lookup_key("premium_monthly").unwrap().as_deref(),
            Some("price_123")
        );
    }

    #[test]
    fn worker_answers_serialized_calls() {
        let mut mock = StripeMock::default();
        mock.delay_ms = 20;
        mock.prices.insert("a".into(), "price_a".into());
        mock.prices.insert("b".into(), "price_b".into());
        let worker = std::sync::Arc::new(StripeWorker::spawn(StripeClient::with_mock(mock)));
        let w2 = std::sync::Arc::clone(&worker);
        let start = Instant::now();
        let t = thread::spawn(move || w2.price_id_for_lookup_key("b"));
        let a = worker.price_id_for_lookup_key("a").unwrap();
        let b = t.join().unwrap().unwrap();
        assert_eq!(a.as_deref(), Some("price_a"));
        assert_eq!(b.as_deref(), Some("price_b"));
        assert!(start.elapsed() < Duration::from_secs(2));
    }
}
