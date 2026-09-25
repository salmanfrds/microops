import { storeToRefs } from 'pinia'
import { useCurrencyStore } from '../stores/currency'

export function useCurrency() {
  const store = useCurrencyStore()
  const { symbol } = storeToRefs(store)
  const { fmt } = store
  return { symbol, fmt }
}
