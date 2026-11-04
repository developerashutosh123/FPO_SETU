import type { ReactNode } from 'react';
import { Term } from '@/components/ui';

/** Plain definitions of the banking terms used on the collateral pages. No scheme terms or rates are stated here. */
export const GLOSSARY: Record<string, ReactNode> = {
  haircut: 'The share of the market value the bank does not lend against, to absorb price falls and quality loss in storage. The percentage comes from the API.',
  ltv: 'Loan-to-value: the loan as a share of the assessed value of the collateral. Fixed at 70% by the contract for this prototype.',
  enwr: 'Electronic negotiable warehouse receipt: a digital receipt for produce held in a registered warehouse or cold store. Here it is issued by a simulated NERL/CCRL adapter.',
  lien: 'A bank\'s recorded claim on the receipt. While a lien is active, no bank on this network can lend against the same receipt.',
  modal: 'The most common trading price at a market (mandi) on a given day.',
  assessed: 'Market value after the haircut: quantity x modal price x (1 - haircut).',
  eligible: 'The most the bank may lend against this receipt: assessed value x LTV.',
};
export const T = ({ k, children }: { k: keyof typeof GLOSSARY; children: ReactNode }) => <Term tip={GLOSSARY[k]}>{children}</Term>;
