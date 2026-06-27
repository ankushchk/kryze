export function isTransactionSms(body: string): boolean {
  const lowercase = body.toLowerCase();
  
  // Basic markers for debit transactions
  const hasDebitKeywords = 
    lowercase.includes('debited') ||
    lowercase.includes('spent') ||
    lowercase.includes('sent') ||
    lowercase.includes('paid') ||
    lowercase.includes('charged') ||
    lowercase.includes('debit of');
    
  // Check if it looks like a transactional text containing amount and banking markers
  const hasAmount = /(?:rs\.?|inr|spent)\s*[0-9,]+/i.test(lowercase);
  
  return hasDebitKeywords && hasAmount;
}

export function parseTransactionSms(body: string): { merchant: string; amount: number } {
  // Amount Extraction
  let amount = 0;
  // Match patterns like "Rs. 250", "Rs 250", "INR 250.00", "debited by 250"
  const amountRegexes = [
    /(?:rs\.?|inr|spent)\s*([0-9,]+(?:\.[0-9]+)?)/i,
    /debited\s*(?:by|of)?\s*(?:rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]+)?)/i
  ];
  
  for (const regex of amountRegexes) {
    const match = body.match(regex);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsed)) {
        amount = parsed;
        break;
      }
    }
  }

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
