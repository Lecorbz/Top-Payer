const express = require('express');
const fs = require('fs');
const cors = require('cors');
const Stripe = require('stripe');
const path = require('path');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // Sert les fichiers statiques (index.html, style.css)

const PAYMENTS_FILE = path.join(__dirname, 'payments.json');

function readPayments() {
  if (!fs.existsSync(PAYMENTS_FILE)) return [];
  const data = fs.readFileSync(PAYMENTS_FILE, 'utf-8');
  return data ? JSON.parse(data) : [];
}

function writePayments(data) {
  fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
}

function getCurrentDay() {
  return new Date().getDate();
}

function isLastDayOfMonth() {
  const today = new Date();
  const nextDay = new Date(today);
  nextDay.setDate(today.getDate() + 1);
  return nextDay.getDate() === 1;
}

function resetIfNewMonth() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  if (now.getDate() === 1 && hour === 0 && minute < 5) {
    writePayments([]);
  }
}

function processRefundIfNeeded() {
  if (!isLastDayOfMonth()) return;

  const payments = readPayments();
  const sorted = [...payments].sort((a, b) => b.amount - a.amount);
  const top = sorted[0];
  if (!top || top.refunded) return;

  stripe.refunds
    .create({ payment_intent: top.paymentIntentId })
    .then(() => {
      top.refunded = true;
      writePayments(payments);
      console.log(`Refunded top payer: ${top.name}`);
    })
    .catch(console.error);
}

app.get('/api/players', (req, res) => {
  const payments = readPayments();
  const sorted = [...payments].sort((a, b) => b.amount - a.amount);
  res.json(sorted);
});

app.post('/api/checkout', async (req, res) => {
  resetIfNewMonth();

  if (isLastDayOfMonth()) {
    return res.status(403).json({ error: 'Payments are closed today.' });
  }

  const { name, email, amount, link } = req.body;
  if (!name || !email || !amount || amount < 1) {
    return res.status(400).json({ error: 'Invalid payment info' });
  }

  const payments = readPayments();
  const minRequired = payments.length + 1;
  if (amount < minRequired) {
    return res.status(400).json({ error: `Minimum amount is ${minRequired}€` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Top Payer - ${name}` },
          unit_amount: amount * 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${req.headers.origin}?success=true`,
      cancel_url: `${req.headers.origin}?canceled=true`,
    });

    payments.push({
      name,
      email,
      amount,
      link,
      date: new Date().toISOString(),
      refunded: false,
      paymentIntentId: session.payment_intent,
    });

    writePayments(payments);
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stripe session creation failed' });
  }
});

// Render index.html by default
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  processRefundIfNeeded(); // Vérifie si on doit rembourser au démarrage
});
