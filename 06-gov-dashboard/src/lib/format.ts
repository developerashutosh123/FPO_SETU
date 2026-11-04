export const formatCount = (n: number) => new Intl.NumberFormat('en-IN').format(n);

const IST = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** DD-MM-YYYY HH:mm IST (seconds optional). Returns the input unchanged if it is not a date. */
export function formatDateTimeIST(iso: string | undefined, withSeconds = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(IST.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}${withSeconds ? `:${p.second}` : ''} IST`;
}

export const SHORT_ORG: Record<string, string> = {
  FpoOrgMSP: 'FPO', BankOrgMSP: 'Bank', BuyerOrgMSP: 'Buyer', RegulatorOrgMSP: 'Regulator', OrdererOrgMSP: 'Orderer',
};
export const shortOrg = (msp: string) => SHORT_ORG[msp] ?? msp;
export const channelShort = (c: string) => c.replace(/-channel$/, '');

/** "FPO", "FPO and Bank", "FPO, Bank and Regulator". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
