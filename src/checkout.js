const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { name, email, amount, link } = req.body;

  if (!name || !email || !amount || isNaN(amount)) {
    return res.status(400).json({ error: 'Champs invalides' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      customer_email: email,
      metadata: { name, link: link || '' },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Classement pour ${name}`,
              description: link || ''
            },
            unit_amount: Math.round(parseFloat(amount) * 100)
          },
          quantity: 1
        }
      ]
    });

    res.status(200).json({ id: session.id });
  } catch (err) {
    console.error('Erreur Stripe :', err.message);
    res.status(500).json({ error: 'Erreur lors de la création de la session' });
  }
};