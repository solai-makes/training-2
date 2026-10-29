#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Open the training2 Dev Container terminal before running this file."
  exit 1
fi
node --input-type=module <<'NODE'
import net from 'node:net';
for (const port of [3000,3001,5173,5174]) await new Promise((resolve,reject)=>{
 const server=net.createServer();server.once('error',()=>reject(new Error('Port '+port+' is busy. Stop the old app command with Ctrl+C first.')));server.listen(port,'0.0.0.0',()=>server.close(resolve));
});
NODE
echo "Choose test payments: 0 = Cash on Delivery only, 1 = Razorpay, 2 = PayPay, 3 = Both"
read -r -p "Choice [0]: " payment_choice
payment_choice="${payment_choice:-0}"
if [[ "$payment_choice" == 1 || "$payment_choice" == 3 ]]; then
  read -r -p "Razorpay TEST Key ID (rzp_test_...): " RAZORPAY_KEY_ID
  read -r -s -p "Razorpay TEST Key Secret (hidden): " RAZORPAY_KEY_SECRET
  echo
  read -r -s -p "Razorpay webhook secret, if configured (hidden; Enter to skip locally): " RAZORPAY_WEBHOOK_SECRET
  echo
  if [[ "$RAZORPAY_KEY_ID" != rzp_test_* || -z "$RAZORPAY_KEY_SECRET" ]]; then echo "Use valid test credentials. Live Razorpay keys are disabled in this training build."; exit 1; fi
  export RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET
fi
if [[ "$payment_choice" == 2 || "$payment_choice" == 3 ]]; then
  read -r -p "PayPay SANDBOX merchant ID: " PAYPAY_MERCHANT_ID
  read -r -s -p "PayPay SANDBOX API key (hidden): " PAYPAY_API_KEY
  echo
  read -r -s -p "PayPay SANDBOX API secret (hidden): " PAYPAY_API_SECRET
  echo
  if [[ -z "$PAYPAY_MERCHANT_ID" || -z "$PAYPAY_API_KEY" || -z "$PAYPAY_API_SECRET" ]]; then echo "All PayPay sandbox credentials are required."; exit 1; fi
  export PAYPAY_MERCHANT_ID PAYPAY_API_KEY PAYPAY_API_SECRET
fi
echo "Starting the shop. Credentials remain in this process environment; no .env file is created."
exec pnpm -r --parallel --filter './apps/*' run dev
