const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function isFundsNotAvailableError(errMsg) {
  const m = (errMsg || "").toLowerCase();
  return (
    m.includes("insufficient") ||
    m.includes("available balance") ||
    m.includes("balance is not sufficient") ||
    m.includes("insufficient funds")
  );
}
// 1) No match = no transfer
if (!destination) {
  console.log("No match for description:", payment.description);
  return { statusCode: 200, body: "OK (no match)" };
}

// 2) Duplicate protection (if already done, do nothing)
if (payment.metadata?.transfer_status === "done") {
  console.log("Already transferred (metadata). PI:", payment.id);
  return { statusCode: 200, body: "OK (already transferred)" };
}

exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: "OK - stripe-webhook live" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");

    const sig =
      event.headers["stripe-signature"] ||
      event.headers["Stripe-Signature"];

    if (!sig) {
      console.log("Missing Stripe-Signature header");
      return { statusCode: 400, body: "Missing Stripe-Signature header" };
    }

    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (stripeEvent.type !== "payment_intent.succeeded") {
      console.log("Ignoring event:", stripeEvent.type);
      return { statusCode: 200, body: "Ignored" };
    }

    const payment = stripeEvent.data.object;
    const text = (payment.description || "").toLowerCase();

    const accounts = {
      leeds: "acct_1R1wLrQuuLjRnbbz",
      york: "acct_1R1svNQpZayq2ZV4",
      halifax: "acct_1R1wLrQuuLjRnbbz",
      tattoo: "acct_1QvLFPQrnn2odUYs",
    };

    let destination = null;

    if (text.includes("tattoo") || text.includes("pigmentation")) {
      destination = accounts.tattoo;
    } else if (text.includes("leeds")) {
      destination = accounts.leeds;
    } else if (text.includes("york")) {
      destination = accounts.york;
    } else if (text.includes("halifax")) {
      destination = accounts.halifax;
    }

    if (!destination) {
      console.log("No match for description:", payment.description);
      return { statusCode: 200, body: "No destination match" };
    }

    try {
  await stripe.transfers.create(
    {
      amount: payment.amount_received,
      currency: (payment.currency || "gbp").toLowerCase(),
      destination,
      metadata: {
        payment_intent: payment.id,
        description: payment.description || "",
      },
    },
    { idempotencyKey: `transfer_${stripeEvent.id}` } // prevents duplicates on retry
  );

  // Mark success on the PaymentIntent
  await stripe.paymentIntents.update(payment.id, {
    metadata: {
      ...payment.metadata,
      transfer_status: "done",
      transfer_destination: destination,
      transfer_amount: String(payment.amount_received),
      last_transfer_error: "",
    },
  });

  console.log("Transfer created to", destination);
} catch (err) {
  const msg = err?.message || String(err);

  // Delay transfer if funds not available yet
  if (isFundsNotAvailableError(msg)) {
    await stripe.paymentIntents.update(payment.id, {
      metadata: {
        ...payment.metadata,
        transfer_status: "pending",
        transfer_destination: destination,
        transfer_amount: String(payment.amount_received),
        last_transfer_error: msg.slice(0, 200),
      },
    });

    console.log("Marked pending due to funds timing. PI:", payment.id);
    return { statusCode: 200, body: "Marked pending" };
  }

  console.error("Transfer error:", msg);
  return { statusCode: 400, body: `Transfer error: ${msg}` };
}


