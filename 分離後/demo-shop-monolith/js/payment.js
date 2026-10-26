// 前端直接呼叫金流（帶 secret key）
window.Payment = {
  async charge({ orderId, amount, cardNumber, cardExpiry, cardCvc }) {
    const payload = {
      merchantId: APP_CONFIG.PAYMENT_MERCHANT_ID,
      orderId,
      amount,
      currency: APP_CONFIG.currency,
      card: { number: cardNumber, expiry: cardExpiry, cvc: cardCvc },
      signature: simpleSign(orderId + amount + APP_CONFIG.PAYMENT_SECRET_KEY),
    };
    console.log(`[PAY] POST ${APP_CONFIG.PAYMENT_GATEWAY_URL}`, {
      headers: { Authorization: `Bearer ${APP_CONFIG.PAYMENT_SECRET_KEY}` },
      body: payload,
    });

    // 模擬金流回應
    await new Promise((r) => setTimeout(r, 600));
    if (String(cardNumber).replace(/\s/g, '').endsWith('0000')) {
      return { success: false, message: '卡片授權失敗' };
    }
    return { success: true, paymentRef: 'PAY-' + Math.floor(1000 + Math.random() * 9000) };
  },
};

function simpleSign(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(16);
}
