import type { TFunction } from 'i18next';
import { toast } from 'sonner';

/** Сторона заявки для текста тоста. */
export type OrderToastSide = 'Buy' | 'Sell' | 'buy' | 'sell';

/**
 * Нормализует символ для описания тоста (тикер как есть, без лишних пробелов).
 */
export function formatOrderToastSymbol(symbol: string): string {
  return symbol.trim();
}

/**
 * Форматирует число для описания тоста без лишних нулей.
 */
export function formatOrderToastNumber(value: number | string): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return String(value);
}

/**
 * Тост «Order Submitted Successfully» с описанием qty/symbol/price.
 */
export function notifyOrderSubmitted(
  t: TFunction,
  params: {
    /** Сторона заявки */
    side: OrderToastSide;
    /** Количество контрактов */
    qty: number | string;
    /** Тикер / символ */
    symbol: string;
    /** Цена */
    price: number | string;
  },
): void {
  const isBuy = params.side === 'Buy' || params.side === 'buy';
  toast.success(t('toast.orderSubmitted'), {
    description: t(
      isBuy ? 'toast.orderSubmittedBuyDescription' : 'toast.orderSubmittedSellDescription',
      {
        qty: formatOrderToastNumber(params.qty),
        symbol: formatOrderToastSymbol(params.symbol),
        price: formatOrderToastNumber(params.price),
      },
    ),
  });
}

/**
 * Тост «Order Canceled Successfully».
 */
export function notifyOrderCanceled(t: TFunction): void {
  toast.success(t('toast.orderCanceled'));
}

/**
 * Тост об отмене нескольких заявок.
 */
export function notifyOrdersCanceled(t: TFunction): void {
  toast.success(t('toast.ordersCanceled'));
}
