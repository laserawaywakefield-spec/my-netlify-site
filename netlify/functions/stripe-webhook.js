const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    await stripe.transfers.create(
      {
        amount: payment.amount_received,
        currency: payment.currency || "gbp",
        destination,
        metadata: {
          payment_intent: payment.id,
          description: payment.description || "",
        },
      },
      {
        idempotencyKey: `transfer_${stripeEvent.id}`,
      }
    );

    console.log("Transfer created to", destination);
    return { statusCode: 200, body: "Processed" };
  } catch (err) {
    console.error("Webhook error:", err.message);
    return { statusCode: 400, body: err.message };
  }
};

