const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // 1) Let you test in a browser
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: "OK - stripe-webhook function is live (GET)",
    };
  }

  try {
    // 2) Decode body
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");

    // 3) If Stripe is calling, this header will be present
    const sig =
      event.headers["stripe-signature"] ||
      event.headers["Stripe-Signature"];

    if (!sig) {
      // This is NOT Stripe (or Stripe is hitting a different endpoint)
      return {
        statusCode: 400,
        body: "Missing Stripe-Signature header (POST). This request did not come from Stripe.",
      };
    }

    // 4) Verify signature (production behaviour)
    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    return { statusCode: 200, body: `Received ${stripeEvent.type}` };
  } catch (err) {
    return { statusCode: 400, body: `Webhook error: ${err.message}` };
  }
};
