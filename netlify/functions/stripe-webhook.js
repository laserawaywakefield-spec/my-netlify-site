const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;

    const sig =
      event.headers["stripe-signature"] ||
      event.headers["Stripe-Signature"];

    if (!sig) {
      return { statusCode: 400, body: "Missing Stripe-Signature header" };
    }

    const stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (stripeEvent.type === "payment_intent.succeeded") {
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
        console.log("No destination match. Description:", payment.description);
        return { statusCode: 200, body: "OK (no match)" };
      }

      await stripe.transfers.create({
        amount: payment.amount_received,
        currency: "gbp",
        destination,
      });

      console.log("Transfer created to:", destination);
    }

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    return { statusCode: 400, body: `Webhook error: ${err.message}` };
  }
};
