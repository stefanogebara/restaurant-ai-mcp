#!/usr/bin/env node
/**
 * One-shot rename of the Stripe Product that backs all three plan prices.
 * Audit BUG #16: customers see "Seatable Subscription" on Checkout regardless
 * of tier because every plan price hangs off the same Product.
 *
 * We can't give each tier its own product name without restructuring
 * billing — but we CAN make the shared product name less generic. The
 * per-tier disambiguation now lives in `subscription_data.description`
 * set by create-checkout-session.js per request.
 *
 *   node scripts/stripe-rename-products.cjs --dry
 *   node scripts/stripe-rename-products.cjs --apply
 *
 * Reads STRIPE_SECRET_KEY + STRIPE_{STARTER,GROWTH,SCALE}_PRICE_ID from .env.
 */
require('dotenv').config();
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const TARGET_NAME = 'Seatable — Gestão de Restaurantes com IA';
const TARGET_DESCRIPTION =
  'IA que atende reservas no WhatsApp, voz e web. Painel do anfitrião com Manager AI, previsão de receita e proteção contra no-shows.';

const PRICE_ENVS = [
  'STRIPE_STARTER_PRICE_ID',
  'STRIPE_GROWTH_PRICE_ID',
  'STRIPE_SCALE_PRICE_ID',
];

const apply = process.argv.includes('--apply');
const dry = process.argv.includes('--dry') || !apply;

async function main() {
  console.log(`\n${dry ? 'DRY RUN' : 'APPLY'}: rename shared Seatable Stripe Product\n`);

  // Resolve all 3 price → product mappings to confirm they share the same
  // product (the structural assumption this script depends on).
  const productIds = new Set();
  for (const envName of PRICE_ENVS) {
    const priceId = process.env[envName];
    if (!priceId) {
      console.warn(`! ${envName} missing — skipping`);
      continue;
    }
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    productIds.add(price.product.id);
    console.log(`  ${envName} = ${priceId} → product ${price.product.id}`);
  }

  if (productIds.size === 0) {
    console.error('No prices resolved. Check .env.');
    process.exit(1);
  }
  if (productIds.size > 1) {
    console.warn(`! Plans use ${productIds.size} different products — script assumes 1. Aborting to avoid partial rename.`);
    process.exit(1);
  }

  const [productId] = [...productIds];
  const product = await stripe.products.retrieve(productId);

  console.log(`\nProduct ${productId}`);
  console.log(`  current name:        ${JSON.stringify(product.name)}`);
  console.log(`  target  name:        ${JSON.stringify(TARGET_NAME)}`);
  console.log(`  current description: ${JSON.stringify(product.description || '')}`);
  console.log(`  target  description: ${JSON.stringify(TARGET_DESCRIPTION)}`);

  const wouldChange =
    product.name !== TARGET_NAME || (product.description || '') !== TARGET_DESCRIPTION;
  console.log(`  changes:             ${wouldChange ? 'YES' : 'no — already matches'}\n`);

  if (apply && wouldChange) {
    const updated = await stripe.products.update(productId, {
      name: TARGET_NAME,
      description: TARGET_DESCRIPTION,
    });
    console.log(`✓ updated → name=${JSON.stringify(updated.name)}`);
  }

  console.log(dry ? '\nDry run complete. Re-run with --apply to commit.' : '\nDone.');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
