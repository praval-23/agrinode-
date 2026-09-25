import type { PaymentSplit } from '@/types/logistics';
export const calculatePaymentSplit=(totalAmount:number):PaymentSplit=>({farmerAmount:Math.round(totalAmount*.85),transporterAmount:Math.round(totalAmount*.10),fpoAmount:Math.round(totalAmount*.05),totalAmount});
