const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

function isFundsNotAvailableError(errMsg) {
  const m = (errMsg || "").toLowerCase();
  return (
    m.includes("insufficient") ||
    m.includes("available balance") ||
    m.includes("balance is not sufficient") ||
    m.includes("insufficient funds") ||
    m.includes("cannot create a transfer")
  );
}

exports.handler = async () => {
  // 🔒 Kill switch (no deploy needed to toggle)
  if (process.env.DISABLE_RETRY === "true") {
    console.log("Retry disabled");
    return { statusCode: 200, body: "Retry disabled" };
  }

  try {
    let intents = [];

    // Prefer Search API (faster + cheaper)
    try {
      const res = await stripe.paymentIntents.search({
        query: "metadata['transfer_status']:'pending'",
        limit: 25,
      });
      intents = res.data;
    } catch {
      const res = await stripe.paymentIntents.list({ limit: 100 });
      intents = res.data.filter(
        (pi) => pi.metadata?.transfer_status === "pending"
      );
    }

    for (const pi of intents) {
      const destination = pi.metadata?.transfer_destination;
      const amount = Number(pi.metadata?.transfer_amount || 0);
      const currency = (pi.currency || "gbp").toLowerCase();

      if (!destination || !amount) continue;
      if (pi.metadata?.transfer_status === "done") continue;

      try {
        await stripe.transfers.create(
          {
            amount,
            currency,
            destination,
            metadata: {
              payment_intent: pi.id,
              retry: "true",
            },
          },
          { idempotencyKey: `retry_transfer_${pi.id}` }
        );

        await stripe.paymentIntents.update(pi.id, {
          metadata: {
            ...pi.metadata,
            transfer_status: "done",
            last_transfer_error: "",
          },
        });

        console.log("Retry transfer succeeded for", pi.id);
      } catch (err) {
        const msg = err?.message || String(err);

        if (isFundsNotAvailableError(msg)) {
          console.log("Still pending (funds not ready). PI:", pi.id);
          continue;
        }

        await stripe.paymentIntents.update(pi.id, {
          metadata: {
            ...pi.metadata,
            transfer_status: "failed",
            last_transfer_error: msg.slice(0, 200),
          },
        });

        console.error("Retry failed (marked failed). PI:", pi.id, msg);
      }
    }

    return { statusCode: 200, body: "Retry run complete" };
  } catch (err) {
    console.error("Retry function error:", err.message);
    return { statusCode: 500, body: err.message };
  }
};
