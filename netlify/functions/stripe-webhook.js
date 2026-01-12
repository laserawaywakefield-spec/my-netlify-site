const Stripe = require("stripe");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 200, body: "OK" };
  }

  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

    const sig =
      event.headers["stripe-signature"] ||
      event.headers["Stripe-Signature"];

    if (!sig) {
      console.log("No Stripe-Signature header");
      return { statusCode: 400, body: "Missing signature" };
    }

    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("Received event:", stripeEvent.type);

    return { statusCode: 200, body: "Webhook received" };
  } catch (err) {
    console.error("Webhook error:", err.message);
    return { statusCode: 400, body: err.message };
  }
};
