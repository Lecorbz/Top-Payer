const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const admin = require('firebase-admin');
const fs = require('fs');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(bodyParser.json());

const port = process.env.PORT || 3000;

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_SDK)),
});
const db = admin.firestore();

app.post('/api/checkout', async (req, res) => {
  const { name, email, amount, link } = req.body;

  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  const blockPayments = (day === new Date(year, month + 1, 0).getDate());
  if (blockPayments) {
    return res.status(403).json({ error: "Paiements bloqués aujourd'hui." });
  }

  const paymentsRef = db.collection('payments');
  const snapshot = await paymentsRef.get();
  const totalUsers = snapshot.size;

  const minAmount = (totalUsers + 1);
  if (amount < minAmount) {
    return res.status(400).json({ error: `Le montant minimum est ${minAmount}€` });
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: `Classement TOP PAYER - ${name}`,
        },
        unit_amount: amount * 100,
      },
      quantity: 1,
    }],
    mode: 'payment',
    customer_email: email,
    success_url: req.headers.origin,
    cancel_url: req.headers.origin,
  });

  await paymentsRef.add({
    name,
    email,
    amount,
    link,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    sessionId: session.id,
  });

  res.json({ url: session.url });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
