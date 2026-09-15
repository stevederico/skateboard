//! Dedicated OS threads for blocking Stripe (libcurl) calls.
//!
//! HTTP workers must not sit inside a 30s Stripe round-trip — the pool has only
//! a handful of threads, and one slow checkout would stall health checks and
//! unrelated API traffic. Each job is handed to a Stripe-owned thread; the
//! request thread waits with a hard timeout and answers 504 if Stripe stalls.
//!
//! The job queue is bounded. A caller that times out stamps a deadline on the
//! `Job`; workers drop expired work instead of still hitting Stripe.

use std::sync::mpsc::{self, Receiver, SyncSender, RecvTimeoutError, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::json::Json;
use crate::stripe::{
    CheckoutParams, CheckoutSession, PortalSession, StripeClient, StripeError,
};

/// How long a request thread waits for a Stripe worker to finish one call.
#[cfg(not(test))]
pub const STRIPE_CALL_TIMEOUT: Duration = Duration::from_secs(10);
#[cfg(test)]
pub const STRIPE_CALL_TIMEOUT: Duration = Duration::from_millis(200);

/// Worker threads draining the Stripe job queue.
const STRIPE_WORKERS: usize = 2;

/// Jobs that may sit waiting for a worker before new ones are rejected.
#[cfg(not(test))]
const STRIPE_QUEUE_CAP: usize = 32;
#[cfg(test)]
const STRIPE_QUEUE_CAP: usize = 2;

/// Handle that submits Stripe work to a background thread.
///
/// Clone-free and `Send`+`Sync`: the channel sender is behind a mutex so every
/// HTTP worker can enqueue without racing.
pub struct StripeWorker {
    tx: Mutex<SyncSender<Job>>,
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

struct Job {
    deadline: Instant,
    kind: JobKind,
}

enum JobKind {
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
    /// Spawn worker threads that own `client` and drain the bounded job queue.
    pub fn spawn(client: StripeClient) -> Self {
        let (tx, rx) = mpsc::sync_channel::<Job>(STRIPE_QUEUE_CAP.max(1));
        let rx = Arc::new(Mutex::new(rx));
        let client = Arc::new(client);
        for i in 0..STRIPE_WORKERS.max(1) {
            let rx = Arc::clone(&rx);
            let client = Arc::clone(&client);
            thread::Builder::new()
                .name(format!("stripe-worker-{i}"))
                .spawn(move || worker_loop(rx, client))
                .expect("failed to spawn stripe worker");
        }
        StripeWorker {
            tx: Mutex::new(tx),
        }
    }

    /// Resolve a price lookup key on the worker thread.
    pub fn price_id_for_lookup_key(&self, lookup_key: &str) -> Result<Option<String>, StripeError> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.enqueue(JobKind::PriceId {
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
        self.enqueue(JobKind::Checkout {
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
        self.enqueue(JobKind::Portal {
            customer: customer.to_string(),
            return_url: return_url.to_string(),
            reply: reply_tx,
        })?;
        wait(reply_rx)
    }

    /// Fetch a subscription on the worker thread.
    pub fn retrieve_subscription(&self, sub_id: &str) -> Result<Json, StripeError> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.enqueue(JobKind::RetrieveSub {
            sub_id: sub_id.to_string(),
            reply: reply_tx,
        })?;
        wait(reply_rx)
    }

    /// Fetch a customer email on the worker thread.
    pub fn customer_email(&self, customer_id: &str) -> Result<Option<String>, StripeError> {
        let (reply_tx, reply_rx) = mpsc::sync_channel(1);
        self.enqueue(JobKind::CustomerEmail {
            customer_id: customer_id.to_string(),
            reply: reply_tx,
        })?;
        wait(reply_rx)
    }

    fn enqueue(&self, kind: JobKind) -> Result<(), StripeError> {
        self.send(Job {
            deadline: Instant::now() + STRIPE_CALL_TIMEOUT,
            kind,
        })
    }

    fn send(&self, job: Job) -> Result<(), StripeError> {
        match self
            .tx
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .try_send(job)
        {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(_)) => Err(StripeError::Busy),
            Err(TrySendError::Disconnected(_)) => {
                Err(StripeError::Transport("stripe worker queue closed".into()))
            }
        }
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

fn worker_loop(rx: Arc<Mutex<Receiver<Job>>>, client: Arc<StripeClient>) {
    loop {
        let job = {
            let guard = rx.lock().unwrap_or_else(|e| e.into_inner());
            guard.recv()
        };
        match job {
            Ok(job) => run_job(&client, job),
            Err(_) => break,
        }
    }
}

fn run_job(client: &StripeClient, job: Job) {
    if Instant::now() >= job.deadline {
        reject_expired(job.kind);
        return;
    }
    match job.kind {
        JobKind::PriceId { lookup_key, reply } => {
            let _ = reply.send(client.price_id_for_lookup_key(&lookup_key));
        }
        JobKind::Checkout { params, reply } => {
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
        JobKind::Portal {
            customer,
            return_url,
            reply,
        } => {
            let _ = reply.send(client.create_portal_session(&customer, &return_url));
        }
        JobKind::RetrieveSub { sub_id, reply } => {
            let _ = reply.send(client.retrieve_subscription(&sub_id));
        }
        JobKind::CustomerEmail { customer_id, reply } => {
            let _ = reply.send(client.customer_email(&customer_id));
        }
    }
}

fn reject_expired(kind: JobKind) {
    match kind {
        JobKind::PriceId { reply, .. } => {
            let _ = reply.send(Err(StripeError::Timeout));
        }
        JobKind::Checkout { reply, .. } => {
            let _ = reply.send(Err(StripeError::Timeout));
        }
        JobKind::Portal { reply, .. } => {
            let _ = reply.send(Err(StripeError::Timeout));
        }
        JobKind::RetrieveSub { reply, .. } => {
            let _ = reply.send(Err(StripeError::Timeout));
        }
        JobKind::CustomerEmail { reply, .. } => {
            let _ = reply.send(Err(StripeError::Timeout));
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

    #[test]
    fn worker_rejects_when_queue_is_full() {
        let mut mock = StripeMock::default();
        mock.delay_ms = 250;
        mock.prices.insert("k".into(), "price_k".into());
        let worker = std::sync::Arc::new(StripeWorker::spawn(StripeClient::with_mock(mock)));
        let mut joins = Vec::new();
        for _ in 0..8 {
            let w = std::sync::Arc::clone(&worker);
            joins.push(thread::spawn(move || w.price_id_for_lookup_key("k")));
        }
        let results: Vec<_> = joins.into_iter().map(|t| t.join().unwrap()).collect();
        assert!(
            results.iter().any(|r| matches!(r, Err(StripeError::Busy))),
            "{results:?}"
        );
    }

    #[test]
    fn worker_drops_jobs_that_missed_their_deadline() {
        let mut mock = StripeMock::default();
        mock.delay_ms = 250;
        mock.prices.insert("a".into(), "price_a".into());
        mock.prices.insert("b".into(), "price_b".into());
        let calls = std::sync::Arc::clone(&mock.call_count);
        let worker = std::sync::Arc::new(StripeWorker::spawn(StripeClient::with_mock(mock)));
        let mut joins = Vec::new();
        for _ in 0..2 {
            let w = std::sync::Arc::clone(&worker);
            joins.push(thread::spawn(move || w.price_id_for_lookup_key("a")));
        }
        thread::sleep(Duration::from_millis(40));
        let w = std::sync::Arc::clone(&worker);
        joins.push(thread::spawn(move || w.price_id_for_lookup_key("b")));
        for t in joins {
            let _ = t.join().unwrap();
        }
        thread::sleep(Duration::from_millis(80));
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
    }
}
