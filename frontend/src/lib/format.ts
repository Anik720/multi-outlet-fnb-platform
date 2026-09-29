const currency = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
});
const integer = new Intl.NumberFormat('en-US');
const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export const formatMoney = (value: number) => currency.format(value);
export const formatInt = (value: number) => integer.format(value);
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** ISO timestamp of local midnight `n` days ago, so "today" means the user's today. */
export const startOfDayIso = (n = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};
