const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const DB_FILE = path.join(__dirname, "db.json");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const readDB = () => {
  if (!fs.existsSync(DB_FILE)) return [];
  const data = fs.readFileSync(DB_FILE);
  return JSON.parse(data);
};

const writeDB = (data) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

app.get("/api/min", (req, res) => {
  const list = readDB();
  const max = list.length > 0 ? Math.max(...list.map((e) => e.amount)) : 0;
  const min = max + 1;
  res.json({ min });
});

app.get("/api/ranking", (req, res) => {
  const list = readDB();
  list.sort((a, b) => b.amount - a.amount);
  res.json(list);
});

app.post("/api/checkout", async (req, res) => {
  const { name, email, amount, link } = req.body;
  const cleanAmount = Math.round(Number(amount));

  if (!name || !email || !cleanAmount || cleanAmount < 1) {
    return res.status(400).json({ error: "Invalid input." });
  }

  const list = readDB();
  const max = list.length > 0 ? Math.max(...list.map((e) => e.amount)) : 0;
  const minRequired = max > 0 ? max + 1 : 1;

  if (cleanAmount < minRequired) {
    return res.status(400).json({ error: `Minimum amount is ${minRequired}€` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Top Payer - ${name}`,
            },
            unit_amount: cleanAmount * 100,
          },
          quantity: 1,
        },
      ],
      customer_email: email,
      success_url: `https://top-payer.vercel.app/success`,
      cancel_url: `https://top-payer.vercel.app/cancel`,
      metadata: {
        name,
        link: link || "",
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe session creation failed." });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
