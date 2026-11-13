import Decimal from "decimal.js";
const ones = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];
function belowThousand(n) {
  const parts = [];
  if (n >= 100) {
    parts.push(ones[Math.floor(n / 100)] + " Hundred");
    n %= 100;
  }
  if (n >= 20) {
    parts.push(tens[Math.floor(n / 10)]);
    n %= 10;
  }
  if (n > 0) parts.push(ones[n]);
  return parts.join(" ");
}
function indian(n) {
  if (!n) return "Zero";
  const parts = [];
  for (const [size, label] of [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ]) {
    const group = Math.floor(n / size);
    if (group) {
      parts.push(belowThousand(group) + " " + label);
      n %= size;
    }
  }
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}
export function amountInWords(value) {
  const amount = new Decimal(value);
  if (amount.lt(0) || amount.gt("9999999999.99"))
    throw new Error("Amount is outside the supported receipt range");
  const [whole, coins] = amount.toFixed(2).split("."),
    rupees = Number(whole),
    paise = Number(coins);
  return (
    indian(rupees) +
    (rupees === 1 ? " Rupee" : " Rupees") +
    (paise
      ? " and " + indian(paise) + (paise === 1 ? " Paisa" : " Paise")
      : "") +
    " Only"
  );
}
