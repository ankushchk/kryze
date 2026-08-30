export function extractSmsAmount(body: string): number | null {
  // Currency-first patterns catch both bank alerts and ordinary payment SMS.
  // Amount-word patterns cover formats such as "Amount debited: 450".
  const amountRegexes = [
    /(?:₹|rs\.?|inr|rupees?)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
    /(?:amount|amt|total|debited|credited|spent|sent|paid|charged|withdrawn|received)\D{0,18}([0-9][0-9,]*(?:\.[0-9]+)?)/i,
  ];

  for (const regex of amountRegexes) {
    const match = body.match(regex);
    if (!match?.[1]) continue;
    const amount = Number.parseFloat(match[1].replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return null;
}

// Use this for the Unprocessed inbox. It intentionally includes credits,
// refunds, offers and other monetary messages so the user, not a brittle
// keyword list, decides what deserves action.
export function hasMonetaryAmount(body: string): boolean {
  return extractSmsAmount(body) !== null;
}

// Kept for any caller that specifically needs an outgoing/debit transaction.
export function isTransactionSms(body: string): boolean {
  const lowercase = body.toLowerCase();
  const hasDebitKeywords =
    lowercase.includes('debited') ||
    lowercase.includes('spent') ||
    lowercase.includes('sent') ||
    lowercase.includes('paid') ||
    lowercase.includes('charged') ||
    lowercase.includes('debit of');
  return hasDebitKeywords && hasMonetaryAmount(body);
}

export function parseTransactionSms(body: string): { merchant: string; amount: number } {
  // Amount Extraction
  let amount = 0;
  amount = extractSmsAmount(body) ?? 0;

  // Merchant Extraction
  let merchant = 'Unknown Merchant';
  // Try to find merchant name following prepositions like "at", "to", "vpa", "info", "for"
  const merchantRegexes = [
    /(?:at|to|vpa|into|info|for)\s+([a-z0-9\s\-_&.*#@]+?)(?:\s+on|\s+using|\s+via|\s+with|\s+ref|\s+upi|\s+for|\s+from|\s+balance|\s+date|\s+\.|$)/i
  ];
  
  for (const regex of merchantRegexes) {
    const match = body.match(regex);
    if (match && match[1]) {
      let candidate = match[1].trim();
      
      // Clean up UPI virtual payment addresses
      if (candidate.includes('@')) {
        candidate = candidate.split('@')[0];
      }
      
      // Strip common transaction metadata
      candidate = candidate.replace(/a\/c\s*x*/gi, '');
      candidate = candidate.replace(/xx[0-9]*/gi, '');
      candidate = candidate.replace(/acct\s*x*/gi, '');
      
      candidate = candidate.trim();
      
      // Capitalize first letters of words
      candidate = candidate.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      if (candidate.length > 0 && candidate.length < 40) {
        merchant = candidate;
        break;
      }
    }
  }

  return { merchant, amount };
}
